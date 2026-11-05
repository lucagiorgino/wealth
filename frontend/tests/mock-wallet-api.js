import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import {
  summaryTestToken,
  assetTestToken,
  refreshTestToken,
  transactionTestToken,
  bulkTransactionTestToken,
  signedExpenseTestToken,
  settingsTestToken,
  walletTestToken,
} from "./browser-config.js";
import { categoryPresets } from "./category-fixtures.js";
import { avatarPng } from "./account-fixtures.js";
import { validTransaction } from "../lib/transactions.js";
import { comparisonPayload, SummaryInputError } from "../lib/summary.js";
import { defaultSidebarOrder, validSettings } from "../lib/settings.js";
import { assetGroups } from "../lib/assets.js";
import {
  csvTestToken,
  importCSV,
  importDocument,
  enhancedCSVTestToken,
  enhancedCSV,
  enhancedDocument,
  mockImportReport,
} from "./transaction-import-fixtures.js";

const defaultWallets = [];
const defaultCategories = [];
const defaultTransactions = [];
function csvOwnerState() {
  return {
    wallets: [],
    categories: [],
    transactions: [],
    imports: new Map(),
    failResponse: false,
    failValidation: false,
    planIds: new Map(),
  };
}
const csvStates = new Map([
  [csvTestToken, csvOwnerState()],
  [enhancedCSVTestToken, csvOwnerState()],
]);
const transactionStates = new Map(
  [
    transactionTestToken,
    bulkTransactionTestToken,
    summaryTestToken,
    assetTestToken,
    refreshTestToken,
    signedExpenseTestToken,
    settingsTestToken,
  ].map((token) => [
    token,
    {
      wallets: [],
      categories: [],
      transactions: [],
      failNextSave: false,
    },
  ]),
);
let categorySaveFailureToken = null;
let walletSaveFailureToken = null;
let categoryDeleteFailurePath = null;
const refreshStates = new Map(
  ["expired", "buffer"].map((kind) => [
    kind,
    { token: `refresh-${kind}`, attempts: 0 },
  ]),
);

async function readBody(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
}

function duplicateCategoryName(items, data, id) {
  return items.some(
    (item) =>
      item.id !== id &&
      (data.kind === undefined || item.kind === data.kind) &&
      item.name.trim().toLowerCase() === data.name.trim().toLowerCase(),
  );
}

const categoryNameConflict = {
  detail:
    "A category with this name already exists at this level. Choose a unique name.",
};

let account = {
  subject: "auth0|wallet-browser-test",
  display_name: null,
  icon: "user-round",
  avatar_url: null,
};
let failNextAccountSave = false;
const settingsByToken = new Map();
const settingsSaveFailures = new Set();
const settingsReadFailures = new Set();
const assetsByOwner = new Map();
const assetSaveFailures = new Set();
const assetReadFailures = new Set();

function projectOccurrences(item, asOf) {
  const result = [];
  const start = new Date(`${item.date}T00:00:00Z`);
  for (let n = 0; n < (item.recurrence_count ?? Infinity); n++) {
    const next = new Date(start);
    if (item.recurrence === "weekly")
      next.setUTCDate(start.getUTCDate() + 7 * n);
    if (["monthly", "annually"].includes(item.recurrence)) {
      next.setUTCDate(1);
      next.setUTCMonth(
        start.getUTCMonth() + n * (item.recurrence === "annually" ? 12 : 1),
      );
      const end = new Date(next);
      end.setUTCMonth(end.getUTCMonth() + 1, 0);
      next.setUTCDate(Math.min(start.getUTCDate(), end.getUTCDate()));
    }
    const occurrence_date = next.toISOString().slice(0, 10);
    if (n > 0 && occurrence_date > asOf) break;
    result.push({ ...item, occurrence_date, occurrence_number: n + 1 });
    if (!item.recurrence || occurrence_date > asOf) break;
  }
  return result;
}

function sumExact(values) {
  const parsed = values.map((value) => {
    const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(value);
    if (!match || !(match[2] || match[3]))
      throw new Error("Invalid mock decimal");
    const scale = (match[3]?.length ?? 0) - Number(match[4] ?? 0);
    return {
      coefficient: BigInt(`${match[1]}${match[2] || "0"}${match[3] ?? ""}`),
      scale,
    };
  });
  const scale = Math.max(0, ...parsed.map((value) => value.scale));
  const total = parsed.reduce(
    (sum, value) =>
      sum + value.coefficient * 10n ** BigInt(scale - value.scale),
    0n,
  );
  const digits = (total < 0n ? -total : total)
    .toString()
    .padStart(scale + 1, "0");
  return `${total < 0n ? "-" : ""}${scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits}`;
}

function compareAmounts(a, b) {
  const difference = BigInt(sumExact([a, negate(b)]).replace(".", ""));
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function negate(value) {
  return value.startsWith("-")
    ? value.slice(1)
    : `-${value.replace(/^\+/, "")}`;
}

function plotPoints(
  entries,
  scaleAmounts = entries.map((entry) => entry.amount),
) {
  const values = [...entries.map((entry) => entry.amount), ...scaleAmounts].map(
    (amount) => sumExact([amount]),
  );
  const scale = Math.max(
    0,
    ...values.map((amount) => amount.split(".")[1]?.length ?? 0),
  );
  const units = values.map((amount) => {
    const [whole, fraction = ""] = amount.split(".");
    return BigInt(`${whole}${fraction.padEnd(scale, "0")}`);
  });
  const maximum = units
    .slice(entries.length)
    .map((value) => (value < 0n ? -value : value))
    .reduce((max, value) => (value > max ? value : max), 0n);
  return entries.map((entry, index) => {
    if (!maximum) return { ...entry, value: 0 };
    const sign = units[index] < 0n ? -1n : 1n;
    const numerator = units[index] * sign * 10000n;
    const quotient = numerator / maximum;
    const remainder = numerator % maximum;
    const roundUp =
      remainder * 2n > maximum ||
      (remainder * 2n === maximum && quotient % 2n === 1n);
    return { ...entry, value: Number(sign * (quotient + (roundUp ? 1n : 0n))) };
  });
}

function yearlyAverage(amount, divisor) {
  const [whole, fraction = ""] = sumExact([amount]).split(".");
  const coefficient = BigInt(`${whole}${fraction}`);
  const sign = coefficient < 0n ? -1n : 1n;
  const numerator = coefficient * sign * 10n ** 18n;
  const denominator = BigInt(divisor) * 10n ** BigInt(fraction.length);
  const rounded =
    numerator / denominator +
    ((numerator % denominator) * 2n >= denominator ? 1n : 0n);
  const digits = rounded.toString().padStart(19, "0");
  return `${sign < 0n ? "-" : ""}${digits.slice(0, -18)}.${digits.slice(-18)}`;
}

function moneyAxisTicks(amounts, signed) {
  const maximum = amounts
    .map((amount) => sumExact([amount]).replace(/^-/, ""))
    .reduce(
      (maximum, amount) =>
        compareAmounts(amount, maximum) > 0 ? amount : maximum,
      "0",
    );
  const extent = compareAmounts(maximum, "0") === 0 ? "1" : maximum;
  const half = sumExact(Array(5).fill(`${extent}e-1`));
  const ticks = [
    [0, "0"],
    [5000, half],
    [10000, extent],
  ];
  if (signed) ticks.unshift([-10000, negate(extent)], [-5000, negate(half)]);
  return ticks.map(([value, amount]) => ({
    value,
    amount,
    label: new Intl.NumberFormat("en", {
      notation: "scientific",
      maximumSignificantDigits: 3,
      useGrouping: false,
    }).format(amount),
  }));
}

function withBalance(
  wallet,
  transactions,
  balance_as_of = new Date().toISOString().slice(0, 10),
) {
  const movements = transactions
    .flatMap((item) => projectOccurrences(item, balance_as_of))
    .filter((item) => item.occurrence_date <= balance_as_of)
    .flatMap((item) => {
      if (item.destination_wallet_id === wallet.id) return [item.amount];
      if (item.source_wallet_id === wallet.id)
        return [item.type === "income" ? item.amount : negate(item.amount)];
      return [];
    });
  return {
    ...wallet,
    currency: wallet.currency ?? "EUR",
    type: wallet.type ?? "bank",
    icon_image_url: wallet.icon_image_url ?? null,
    current_amount: movements.length
      ? sumExact([wallet.initial_amount, ...movements])
      : wallet.initial_amount,
    balance_as_of,
  };
}

function assetReport(wallets, transactions, assets, year) {
  const as_of = new Date().toISOString().slice(0, 10);
  const yearText = String(year).padStart(4, "0");
  const checkpoints = [
    year > 1 ? `${String(year - 1).padStart(4, "0")}-12-31` : null,
    ...Array.from({ length: 12 }, (_, i) => {
      const month = String(i + 1).padStart(2, "0");
      const end = new Date(`${yearText}-${month}-01T00:00:00Z`);
      end.setUTCMonth(end.getUTCMonth() + 1);
      end.setUTCDate(0);
      return end.toISOString().slice(0, 10);
    }),
  ].map((cutoff, index) =>
    cutoff === null ||
    (index === 0 ? cutoff : cutoff.slice(0, 7)) >
      (index === 0 ? as_of : as_of.slice(0, 7))
      ? null
      : cutoff > as_of
        ? as_of
        : cutoff,
  );
  const latest = Math.max(
    0,
    ...checkpoints.flatMap((date, i) => (date ? [i] : [])),
  );
  const values = (amounts) => ({
    opening: amounts[0],
    months: amounts.slice(1),
    latest: amounts[latest],
  });
  const holdings = [
    ...wallets.map((wallet) => ({
      ...wallet,
      asset_group: "cash",
      source: "wallet",
      currency: wallet.currency ?? "EUR",
      amounts: checkpoints.map((cutoff) =>
        cutoff
          ? withBalance(wallet, transactions, cutoff).current_amount
          : null,
      ),
    })),
    ...assets.map((asset) => ({
      ...asset,
      source: "asset",
      amounts: checkpoints.map((cutoff) =>
        cutoff
          ? (asset.valuations
              .filter((value) => value.date <= cutoff)
              .sort((a, b) => b.date.localeCompare(a.date))[0]?.amount ?? null)
          : null,
      ),
    })),
  ];
  return {
    year,
    as_of,
    currencies: [...new Set(holdings.map((item) => item.currency))]
      .sort()
      .map((currency) => {
        const selected = holdings.filter((item) => item.currency === currency);
        const totals = (items) =>
          checkpoints.map((cutoff, i) =>
            cutoff
              ? sumExact(
                  items.flatMap((item) =>
                    item.amounts[i] === null ? [] : [item.amounts[i]],
                  ),
                )
              : null,
          );
        const groups = assetGroups.flatMap((group) => {
          const members = selected.filter(
            (item) => item.asset_group === group.value,
          );
          return members.length
            ? [
                {
                  key: group.value,
                  label: group.label,
                  values: values(totals(members)),
                  holdings: members.map((item) => ({
                    ...item,
                    values: values(item.amounts),
                  })),
                },
              ]
            : [];
        });
        const totalAssets = totals(
          selected.filter((item) => item.asset_group !== "liabilities"),
        );
        const liabilities = totals(
          selected.filter((item) => item.asset_group === "liabilities"),
        );
        const net = totalAssets.map((amount, i) =>
          amount === null ? null : sumExact([amount, negate(liabilities[i])]),
        );
        const missing_values = checkpoints.map((cutoff, i) =>
          cutoff
            ? selected.filter((item) => item.amounts[i] === null).length
            : 0,
        );
        const change = net.map((amount, i) =>
          !i ||
          amount === null ||
          net[i - 1] === null ||
          missing_values[i] ||
          missing_values[i - 1]
            ? null
            : sumExact([amount, negate(net[i - 1])]),
        );
        const percent = change.map((amount, i) => {
          if (amount === null || compareAmounts(net[i - 1], "0") === 0)
            return null;
          const base = sumExact([net[i - 1]]).replace(/^-/, "");
          const scale =
            (amount.split(".")[1]?.length ?? 0) -
            (base.split(".")[1]?.length ?? 0);
          return yearlyAverage(
            (BigInt(amount.replace(".", "")) * 100n).toString(),
            BigInt(base.replace(".", "")) * 10n ** BigInt(scale),
          );
        });
        const points = plotPoints(
          net.slice(1).flatMap((amount, i) =>
            amount === null
              ? []
              : [
                  {
                    key: String(i + 1),
                    label: new Intl.DateTimeFormat("en", {
                      month: "short",
                      timeZone: "UTC",
                    }).format(
                      new Date(
                        `2024-${String(i + 1).padStart(2, "0")}-01T00:00:00Z`,
                      ),
                    ),
                    amount,
                  },
                ],
          ),
        );
        const allocation = plotPoints(
          groups
            .filter(
              (group) =>
                group.key !== "liabilities" && group.values.latest !== null,
            )
            .map((group) => ({
              key: group.key,
              label: group.label,
              amount: group.values.latest,
            })),
        );
        return {
          currency,
          groups,
          assets: values(totalAssets),
          liabilities: values(liabilities),
          net_worth: values(net),
          change: values(change),
          change_percent: values(percent),
          missing_values,
          trend: Array.from(
            { length: 12 },
            (_, i) =>
              points.find((point) => point.key === String(i + 1)) ?? {
                key: String(i + 1),
                label: String(i + 1),
                amount: null,
                value: null,
              },
          ),
          allocation,
          net_worth_ticks: moneyAxisTicks(
            points.map((point) => point.amount),
            true,
          ),
          allocation_ticks: moneyAxisTicks(
            allocation.map((point) => point.amount),
            allocation.some((point) => compareAmounts(point.amount, "0") < 0),
          ),
        };
      }),
  };
}

function transactionSummary(occurrences) {
  const currencies = [...new Set(occurrences.map((item) => item.currency))]
    .sort()
    .map((currency) => {
      const items = occurrences.filter((item) => item.currency === currency);
      const totals = Object.fromEntries(
        ["income", "expense", "transfer"].map((type) => [
          type,
          sumExact(
            items
              .filter((item) => item.type === type)
              .map((item) => item.amount),
          ),
        ]),
      );
      return {
        currency,
        ...totals,
        net: sumExact([totals.income, negate(totals.expense)]),
      };
    });
  const expenses = occurrences.filter((item) => item.type === "expense");
  const wallet_expenses = [
    ...new Set(expenses.map((item) => item.source_wallet_id)),
  ]
    .map((id) => {
      const items = expenses.filter((item) => item.source_wallet_id === id);
      return {
        wallet_id: id,
        wallet_name: items[0].source_wallet_name,
        currency: items[0].currency,
        amount: sumExact(items.map((item) => item.amount)),
      };
    })
    .sort(
      (a, b) =>
        a.wallet_name.localeCompare(b.wallet_name) ||
        a.wallet_id.localeCompare(b.wallet_id),
    );
  return { currencies, wallet_expenses };
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1:3102");
  const send = (status, data) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(data));
  };
  if (request.url === "/health") return send(200, { status: "ok" });
  if (url.pathname === "/_test/auth0/.well-known/openid-configuration") {
    return send(200, {
      issuer: "https://tenant.example.test/",
      authorization_endpoint: "https://tenant.example.test/authorize",
      token_endpoint: "https://tenant.example.test/oauth/token",
      jwks_uri: "https://tenant.example.test/.well-known/jwks.json",
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      token_endpoint_auth_methods_supported: [
        "client_secret_post",
        "client_secret_basic",
      ],
    });
  }
  if (url.pathname === "/_test/auth0/oauth/token") {
    let text = "";
    for await (const chunk of request) text += chunk;
    const form = new URLSearchParams(text);
    if (form.get("grant_type") !== "refresh_token")
      return send(400, { error: "unsupported_grant_type" });
    const token = form.get("refresh_token");
    if (token === "refresh-invalid")
      return send(400, {
        error: "invalid_grant",
        error_description: "Synthetic rejected grant detail",
      });
    if (token === "refresh-unavailable")
      return send(503, {
        error: "temporarily_unavailable",
        error_description: "Synthetic provider outage detail",
      });
    const kind = token?.includes("expired")
      ? "expired"
      : token?.includes("buffer")
        ? "buffer"
        : null;
    const state = refreshStates.get(kind);
    if (!state) return send(400, { error: "invalid_grant" });
    state.attempts++;
    if (state.token !== token) return send(400, { error: "invalid_grant" });
    state.token = `rotated-${kind}-${state.attempts}`;
    return send(200, {
      access_token: refreshTestToken,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: state.token,
      scope: "openid profile email offline_access",
    });
  }
  const transactionState = transactionStates.get(
    request.headers.authorization?.replace("Bearer ", ""),
  );
  const isTransactionTest = Boolean(transactionState);
  const csvState = csvStates.get(
    request.headers.authorization?.replace("Bearer ", ""),
  );
  const isCSVTest = Boolean(csvState);
  if (
    !isTransactionTest &&
    !isCSVTest &&
    request.headers.authorization !== `Bearer ${walletTestToken}`
  ) {
    return send(401, { detail: "Unauthorized" });
  }
  if (url.pathname === "/_test/auth0/status") {
    const state = refreshStates.get(url.searchParams.get("case"));
    return state
      ? send(200, { attempts: state.attempts })
      : send(404, { detail: "Unknown test case" });
  }
  const settingsOwner = request.headers.authorization;
  if (
    url.pathname === "/_test/settings-save-failure" &&
    request.method === "POST"
  ) {
    settingsSaveFailures.add(settingsOwner);
    return send(200, { status: "ok" });
  }
  if (
    url.pathname === "/_test/settings-read-failure" &&
    request.method === "POST"
  ) {
    const { enabled } = await readBody(request);
    if (enabled) settingsReadFailures.add(settingsOwner);
    else settingsReadFailures.delete(settingsOwner);
    return send(200, { status: "ok" });
  }
  if (url.pathname === "/api/v1/settings") {
    if (request.method === "PUT") {
      if (settingsSaveFailures.delete(settingsOwner)) {
        return send(503, { detail: "Database is unavailable" });
      }
      const settings = await readBody(request);
      if (!validSettings(settings))
        return send(422, { detail: "Invalid settings" });
      settingsByToken.set(settingsOwner, settings);
      return send(200, settings);
    }
    if (request.method === "GET") {
      if (settingsReadFailures.has(settingsOwner)) {
        return send(503, { detail: "Database is unavailable" });
      }
      return send(
        200,
        settingsByToken.get(settingsOwner) ?? {
          theme: "light",
          sidebar_order: defaultSidebarOrder,
        },
      );
    }
  }
  const wallets = isCSVTest
    ? csvState.wallets
    : isTransactionTest
      ? transactionState.wallets
      : defaultWallets;
  const categories = isCSVTest
    ? csvState.categories
    : isTransactionTest
      ? transactionState.categories
      : defaultCategories;
  const transactions = isCSVTest
    ? csvState.transactions
    : isTransactionTest
      ? transactionState.transactions
      : defaultTransactions;
  const assetOwner = request.headers.authorization;
  const assets = assetsByOwner.get(assetOwner) ?? [];
  if (url.pathname === "/_test/asset-save-failure") {
    assetSaveFailures.add(assetOwner);
    return send(200, {});
  }
  if (url.pathname === "/_test/asset-read-failure") {
    const { enabled } = await readBody(request);
    if (enabled) assetReadFailures.add(assetOwner);
    else assetReadFailures.delete(assetOwner);
    return send(200, {});
  }
  if (url.pathname.startsWith("/api/v1/assets")) {
    if (request.method === "GET") {
      if (assetReadFailures.has(assetOwner)) return send(503, {});
      return send(
        200,
        assetReport(
          wallets,
          transactions,
          assets,
          Number(url.searchParams.get("year")),
        ),
      );
    }
    if (assetSaveFailures.delete(assetOwner)) return send(503, {});
    if (request.method === "POST") {
      const { date, amount, ...data } = await readBody(request);
      const position = {
        id: randomUUID(),
        ...data,
        valuations: [{ date, amount }],
      };
      assets.push(position);
      assetsByOwner.set(assetOwner, assets);
      return send(201, position);
    }
    const position = assets.find(
      (item) => item.id === url.pathname.split("/")[4],
    );
    if (!position) return send(404, {});
    if (request.method === "DELETE") {
      assets.splice(assets.indexOf(position), 1);
      return send(204);
    }
    if (request.method === "PUT") {
      const data = await readBody(request);
      const previous = position.valuations.find(
        (item) => item.date === data.date,
      );
      if (previous) Object.assign(previous, data);
      else position.valuations.push(data);
      return send(204);
    }
  }
  if (url.pathname === "/_test/summary-failure" && isTransactionTest) {
    transactionState.failSummary = true;
    return send(200, { status: "ok" });
  }
  if (url.pathname === "/_test/comparison-failure" && isTransactionTest) {
    transactionState.failComparison = true;
    return send(200, { status: "ok" });
  }
  if (url.pathname === "/api/v1/summary/compare" && request.method === "POST") {
    if (transactionState?.failComparison) {
      transactionState.failComparison = false;
      return send(503, { detail: "Database is unavailable" });
    }
    let data;
    try {
      data = comparisonPayload(await readBody(request));
    } catch (error) {
      if (!(error instanceof SummaryInputError)) throw error;
      return send(422, { detail: error.message });
    }
    const as_of = new Date().toISOString().slice(0, 10);
    if (
      data.periods.some(
        (period) =>
          `${String(period.year).padStart(4, "0")}-${String(period.month ?? 1).padStart(2, "0")}-01` >
            as_of ||
          (period.end_year !== undefined &&
            period.end_year > Number(as_of.slice(0, 4))),
      )
    )
      return send(422, { detail: "Choose periods that have started." });
    const periods = data.periods.map((period, index) => ({
      ...period,
      end_year: period.end_year ?? null,
      key: `p${index}`,
      label:
        data.kind === "month"
          ? `${new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, period.month - 1, 1)))} ${period.year}`
          : data.kind === "average"
            ? `${period.year}-${period.end_year} yearly average`
            : String(period.year),
      years: (period.end_year ?? period.year) - period.year + 1,
      months:
        data.kind === "month"
          ? 1
          : ((period.end_year ?? period.year) - period.year) * 12 +
            ((period.end_year ?? period.year) === Number(as_of.slice(0, 4))
              ? Number(as_of.slice(5, 7))
              : 12),
    }));
    const occurrences = transactions
      .flatMap((item) => projectOccurrences(item, as_of))
      .filter(
        (item) => item.type === "expense" && item.occurrence_date <= as_of,
      );
    const byPeriod = periods.map((period) =>
      occurrences.filter(
        (item) =>
          Number(item.occurrence_date.slice(0, 4)) >= period.year &&
          Number(item.occurrence_date.slice(0, 4)) <=
            (period.end_year ?? period.year) &&
          (data.kind !== "month" ||
            Number(item.occurrence_date.slice(5, 7)) === period.month),
      ),
    );
    const currencies = [
      ...new Set(
        byPeriod
          .flat()
          .map(
            (item) =>
              wallets.find((wallet) => wallet.id === item.source_wallet_id)
                .currency ?? "EUR",
          ),
      ),
    ]
      .sort()
      .map((currency) => {
        const rows = byPeriod.map((items) =>
          items.filter(
            (item) =>
              (wallets.find((wallet) => wallet.id === item.source_wallet_id)
                .currency ?? "EUR") === currency,
          ),
        );
        const amountFor = (items, index) => {
          const total = sumExact(items.map((item) => item.amount));
          return data.kind === "average"
            ? yearlyAverage(total, periods[index].years)
            : total;
        };
        const pointsFor = (items) =>
          items.map((entries, index) => ({
            key: periods[index].key,
            label: periods[index].label,
            amount: amountFor(entries, index),
          }));
        const groups = categories
          .filter((category) =>
            rows.flat().some((item) => item.category_id === category.id),
          )
          .map((category) => ({
            id: category.id,
            name: category.name,
            points: pointsFor(
              rows.map((items) =>
                items.filter((item) => item.category_id === category.id),
              ),
            ),
          }));
        const maximums = groups.flatMap((group) =>
          group.points.map((point) => point.amount),
        );
        const maximum = (group) =>
          group.points
            .map((point) => point.amount)
            .sort(compareAmounts)
            .at(-1);
        groups.sort(
          (a, b) =>
            compareAmounts(maximum(b), maximum(a)) ||
            a.name.localeCompare(b.name) ||
            a.id.localeCompare(b.id),
        );
        return {
          currency,
          totals: plotPoints(pointsFor(rows)),
          categories: groups.map((group) => ({
            ...group,
            points: plotPoints(group.points, maximums),
          })),
        };
      });
    return send(200, { kind: data.kind, as_of, periods, currencies });
  }
  if (
    ["/api/v1/summary", "/api/v1/summary/analysis"].includes(url.pathname) &&
    request.method === "GET"
  ) {
    if (transactionState?.failSummary) {
      transactionState.failSummary = false;
      return send(503, { detail: "Database is unavailable" });
    }
    const year = Number(url.searchParams.get("year"));
    const as_of = new Date().toISOString().slice(0, 10);
    const items = transactions
      .flatMap((item) => projectOccurrences(item, as_of))
      .filter(
        (item) =>
          ["expense", "income"].includes(item.type) &&
          item.occurrence_date <= as_of &&
          Number(item.occurrence_date.slice(0, 4)) === year,
      );
    const totals = (rows) => ({
      months: Array.from({ length: 12 }, (_, month) =>
        sumExact(
          rows
            .filter(
              (item) => Number(item.occurrence_date.slice(5, 7)) === month + 1,
            )
            .map((item) => item.amount),
        ),
      ),
      total: sumExact(rows.map((item) => item.amount)),
    });
    const familyCurrencies = (kind) =>
      [
        ...new Set(
          items
            .filter((item) => item.type === kind)
            .map(
              (item) =>
                wallets.find((wallet) => wallet.id === item.source_wallet_id)
                  .currency ?? "EUR",
            ),
        ),
      ]
        .sort()
        .map((currency) => {
          const rows = items.filter(
            (item) =>
              item.type === kind &&
              (wallets.find((wallet) => wallet.id === item.source_wallet_id)
                .currency ?? "EUR") === currency,
          );
          return {
            currency,
            ...totals(rows),
            categories: categories
              .filter((category) =>
                rows.some((item) => item.category_id === category.id),
              )
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((category) => {
                const entries = rows.filter(
                  (item) => item.category_id === category.id,
                );
                return {
                  id: category.id,
                  name: category.name,
                  ...totals(entries),
                  subcategories: [
                    ...new Set(entries.map((item) => item.subcategory_id)),
                  ].map((id) => ({
                    id,
                    name:
                      id === null
                        ? "Without subcategory"
                        : category.subcategories.find(
                            (child) => child.id === id,
                          ).name,
                    ...totals(
                      entries.filter((item) => item.subcategory_id === id),
                    ),
                  })),
                };
              }),
          };
        });
    const currencies = familyCurrencies("expense");
    const summary = { year, as_of, currencies };
    const income_summary = {
      year,
      as_of,
      currencies: familyCurrencies("income"),
    };
    if (url.pathname.endsWith("/analysis")) {
      const count = 12;
      const codes = [
        ...new Set(
          [...currencies, ...income_summary.currencies].map(
            (item) => item.currency,
          ),
        ),
      ].sort();
      const charts = codes.map((currency) => {
        const expense = currencies.find((item) => item.currency === currency);
        const income = income_summary.currencies.find(
          (item) => item.currency === currency,
        );
        const expenseMonths = expense?.months ?? Array(12).fill("0");
        const incomeMonths = income?.months ?? Array(12).fill("0");
        const scale = [
          ...expenseMonths.slice(0, count),
          ...incomeMonths.slice(0, count),
        ];
        const netMonths = totals(
          items
            .filter(
              (item) =>
                wallets.find((wallet) => wallet.id === item.source_wallet_id)
                  .currency === currency,
            )
            .map((item) => ({
              ...item,
              amount:
                item.type === "income" ? item.amount : negate(item.amount),
            })),
        ).months;
        const monthlyPoints = (months, amounts) =>
          plotPoints(
            months.slice(0, count).map((amount, index) => ({
              key: String(index + 1),
              label: new Intl.DateTimeFormat("en", {
                month: "short",
                timeZone: "UTC",
              }).format(new Date(Date.UTC(2024, index, 1))),
              amount,
            })),
            amounts,
          );
        const ranking = plotPoints(
          [...(expense?.categories ?? [])]
            .sort(
              (a, b) =>
                compareAmounts(b.total, a.total) ||
                a.name.localeCompare(b.name),
            )
            .slice(0, 10)
            .map((category) => ({
              key: category.id,
              label: category.name,
              amount: category.total,
            })),
        );
        const rankingSum = sumExact(ranking.map((point) => point.amount));
        return {
          currency,
          ranking,
          ranking_sum: rankingSum,
          ranking_average: ranking.length
            ? yearlyAverage(rankingSum, ranking.length)
            : "0",
          totals: {
            expenses: expense?.total ?? "0",
            income: income?.total ?? "0",
            net: sumExact(netMonths),
          },
          trend: monthlyPoints(expenseMonths, scale),
          income_trend: monthlyPoints(incomeMonths, scale),
          net_trend: monthlyPoints(netMonths),
          cashflow_ticks: moneyAxisTicks(
            scale,
            expenseMonths.some((amount) => amount.startsWith("-")),
          ),
          net_ticks: moneyAxisTicks(netMonths, true),
        };
      });
      return send(200, { summary, income_summary, charts });
    }
    return send(200, summary);
  }
  if (url.pathname === "/_test/csv-confirm-response-failure" && isCSVTest) {
    csvState.failResponse = true;
    return send(200, { status: "ok" });
  }
  if (url.pathname === "/_test/csv-confirm-validation-failure" && isCSVTest) {
    csvState.failValidation = true;
    return send(200, { status: "ok" });
  }
  if (url.pathname === "/api/v1/transactions/import/upload") {
    let text = "";
    for await (const chunk of request) text += chunk;
    if (text === enhancedCSV) return send(200, enhancedDocument);
    if (text !== importCSV)
      return send(422, { detail: "The test CSV is malformed." });
    return send(200, importDocument);
  }
  if (
    [
      "/api/v1/transactions/import/validate",
      "/api/v1/transactions/import/confirm",
    ].includes(url.pathname)
  ) {
    const data = await readBody(request);
    const report = mockImportReport(data, csvState);
    const rows = report.rows;
    if (url.pathname.endsWith("/validate")) return send(200, report);
    if (csvState.failValidation) {
      csvState.failValidation = false;
      const row = report.rows.find((item) => item.included);
      row.errors = {
        source_wallet_id: "Recheck this wallet before importing.",
      };
      row.transaction = null;
      report.invalid = 1;
      return send(422, {
        detail: "Revalidate current references.",
        validation: report,
      });
    }
    const previous = csvState.imports.get(data.import_id);
    if (previous) return send(201, { imported: previous });
    if (report.invalid || !report.selected || !report.creations_approved)
      return send(422, {
        detail: "Fix or discard invalid rows.",
        validation: report,
      });
    for (const item of report.creations) {
      const { id, name, colour, icon } = item;
      if (item.kind === "wallet")
        wallets.push({
          id,
          name,
          colour,
          icon,
          initial_amount: "0",
          created_at: new Date().toISOString(),
        });
      else if (item.kind === "category")
        categories.push({
          id,
          name,
          colour,
          icon,
          preset_key: item.preset_key ?? null,
          kind: item.category_kind,
          subcategories: [],
        });
      else
        categories
          .find((category) => category.id === item.category_id)
          .subcategories.push({ id, name, colour, icon });
    }
    for (const row of rows.filter((row) => row.included))
      transactions.push({
        ...row.transaction,
        is_pinned: false,
        id: randomUUID(),
        created_at: new Date().toISOString(),
      });
    csvState.imports.set(data.import_id, report.selected);
    if (csvState.failResponse) {
      csvState.failResponse = false;
      return send(503, { detail: "Response interrupted after commit." });
    }
    return send(201, { imported: report.selected });
  }
  if (
    url.pathname === "/_test/wallet-save-failure" &&
    request.method === "POST"
  ) {
    walletSaveFailureToken = request.headers.authorization;
    return send(200, { status: "ok" });
  }
  if (
    url.pathname === "/_test/transaction-save-failure" &&
    request.method === "POST"
  ) {
    transactionState.failNextSave = true;
    return send(200, { status: "ok" });
  }
  if (
    url.pathname === "/api/v1/transactions/options" &&
    request.method === "GET"
  ) {
    return send(200, {
      wallets: wallets.map(
        ({ id, name, currency, colour, icon, icon_image_url }) => ({
          id,
          name,
          currency: currency ?? "EUR",
          colour,
          icon,
          icon_image_url: icon_image_url ?? null,
        }),
      ),
    });
  }
  if (url.pathname === "/api/v1/transactions" && request.method === "GET") {
    const as_of = new Date().toISOString().slice(0, 10);
    const occurrences = transactions
      .flatMap((item) => projectOccurrences(item, as_of))
      .map((item) => {
        const category = categories.find(
          (category) => category.id === item.category_id,
        );
        return {
          ...item,
          is_pinned: item.is_pinned ?? false,
          source_wallet_name: wallets.find(
            (wallet) => wallet.id === item.source_wallet_id,
          ).name,
          currency:
            wallets.find((wallet) => wallet.id === item.source_wallet_id)
              .currency ?? "EUR",
          destination_wallet_name:
            wallets.find((wallet) => wallet.id === item.destination_wallet_id)
              ?.name ?? null,
          category_name: category.name,
          subcategory_name:
            category.subcategories.find(
              (child) => child.id === item.subcategory_id,
            )?.name ?? null,
        };
      })
      .filter((item) => {
        const p = url.searchParams;
        return (
          (!p.get("q") ||
            item.description
              .toLowerCase()
              .includes(p.get("q").toLowerCase())) &&
          (!p.get("type") || item.type === p.get("type")) &&
          (!p.get("wallet_id") ||
            [item.source_wallet_id, item.destination_wallet_id].includes(
              p.get("wallet_id"),
            )) &&
          (!p.get("category_id") ||
            item.category_id === p.get("category_id")) &&
          (!p.get("subcategory_id") ||
            item.subcategory_id === p.get("subcategory_id")) &&
          (!p.get("date_from") || item.occurrence_date >= p.get("date_from")) &&
          (!p.get("date_to") || item.occurrence_date <= p.get("date_to"))
        );
      })
      .sort(
        (a, b) =>
          Number(b.is_pinned) - Number(a.is_pinned) ||
          b.occurrence_date.localeCompare(a.occurrence_date) ||
          b.created_at.localeCompare(a.created_at) ||
          a.id.localeCompare(b.id),
      );
    const page = Number(url.searchParams.get("page") ?? 1);
    const page_size = Number(url.searchParams.get("page_size") ?? 10);
    return send(200, {
      transactions: occurrences.slice((page - 1) * page_size, page * page_size),
      page,
      page_size,
      total: occurrences.length,
      as_of,
      summary: transactionSummary(occurrences),
    });
  }
  if (
    url.pathname === "/api/v1/transactions/bulk" &&
    ["PATCH", "DELETE"].includes(request.method)
  ) {
    if (transactionState?.failNextSave) {
      transactionState.failNextSave = false;
      return send(503, { detail: "Database is unavailable" });
    }
    const data = await readBody(request);
    if (
      !Array.isArray(data.ids) ||
      !data.ids.length ||
      data.ids.length > 100 ||
      new Set(data.ids).size !== data.ids.length
    ) {
      return send(422, { detail: "Choose different transaction series." });
    }
    const selected = data.ids.map((id) =>
      transactions.find((item) => item.id === id),
    );
    if (selected.some((item) => !item))
      return send(404, { detail: "Transaction not found" });
    if (request.method === "DELETE") {
      for (const item of selected)
        transactions.splice(transactions.indexOf(item), 1);
    } else {
      if (!data.changes || !Object.keys(data.changes).length)
        return send(422, { detail: "Choose fields to change." });
      const merged = selected.map((item) => ({ ...item, ...data.changes }));
      if (
        merged.some((item) => {
          const category = categories.find(
            (category) => category.id === item.category_id,
          );
          const source = wallets.find(
            (wallet) => wallet.id === item.source_wallet_id,
          );
          const destination = wallets.find(
            (wallet) => wallet.id === item.destination_wallet_id,
          );
          return (
            !validTransaction(item) ||
            !source ||
            category?.kind !==
              (item.type === "income" ? "income" : "expense") ||
            (item.subcategory_id &&
              !category.subcategories.some(
                (child) => child.id === item.subcategory_id,
              )) ||
            (item.type === "transfer" &&
              (!destination || source.currency !== destination.currency)) ||
            ("is_pinned" in item && typeof item.is_pinned !== "boolean")
          );
        })
      )
        return send(422, {
          detail:
            "Changes must be valid for every selected transaction. No transactions were changed.",
        });
      selected.forEach((item, index) => Object.assign(item, merged[index]));
    }
    return send(200, { count: selected.length });
  }
  if (
    url.pathname.startsWith("/api/v1/transactions") &&
    ["POST", "PUT", "DELETE"].includes(request.method)
  ) {
    if (transactionState?.failNextSave) {
      transactionState.failNextSave = false;
      return send(503, { detail: "Database is unavailable" });
    }
    let data;
    if (request.method !== "DELETE") {
      data = {
        description: "",
        destination_wallet_id: null,
        subcategory_id: null,
        recurrence: null,
        recurrence_count: null,
        ...(await readBody(request)),
      };
      const root = categories.find(
        (category) => category.id === data.category_id,
      );
      const source = wallets.find(
        (wallet) => wallet.id === data.source_wallet_id,
      );
      const destination = wallets.find(
        (wallet) => wallet.id === data.destination_wallet_id,
      );
      if (
        !validTransaction(data) ||
        !source ||
        root?.kind !== (data.type === "income" ? "income" : "expense") ||
        (data.subcategory_id &&
          !root.subcategories.some(
            (child) => child.id === data.subcategory_id,
          )) ||
        (data.type === "transfer" &&
          (!destination ||
            (source.currency ?? "EUR") !== (destination.currency ?? "EUR")))
      )
        return send(422, { detail: "Invalid amount or category family." });
    }
    if (url.pathname === "/api/v1/transactions" && request.method === "POST") {
      const item = {
        ...data,
        is_pinned: false,
        id: randomUUID(),
        created_at: new Date().toISOString(),
      };
      transactions.push(item);
      return send(201, item);
    }
    const item = transactions.find(
      (item) => item.id === url.pathname.split("/")[4],
    );
    if (!item) return send(404, { detail: "Transaction not found" });
    if (request.method === "DELETE") {
      transactions.splice(transactions.indexOf(item), 1);
      return send(204);
    }
    Object.assign(item, data);
    return send(200, item);
  }
  if (request.url === "/api/v1/me" && request.method === "GET") {
    return send(200, { subject: "auth0|wallet-browser-test" });
  }
  if (
    request.url === "/_test/category-save-failure" &&
    request.method === "POST"
  ) {
    categorySaveFailureToken = request.headers.authorization;
    return send(200, { status: "ok" });
  }
  if (
    request.url === "/_test/category-delete-failure" &&
    request.method === "POST"
  ) {
    const { id } = await readBody(request);
    categoryDeleteFailurePath = `/api/v1/categories/${id}`;
    return send(200, { status: "ok" });
  }
  if (
    url.pathname === "/api/v1/categories/presets" &&
    request.method === "GET"
  ) {
    return send(200, { presets: categoryPresets });
  }
  if (
    categorySaveFailureToken === request.headers.authorization &&
    url.pathname.startsWith("/api/v1/categories") &&
    ["POST", "PUT"].includes(request.method)
  ) {
    categorySaveFailureToken = null;
    return send(503, { detail: "Database is unavailable" });
  }
  if (
    url.pathname === "/api/v1/categories/import" &&
    request.method === "POST"
  ) {
    const data = await readBody(request);
    if (
      !Array.isArray(data.keys) ||
      data.keys.length < 1 ||
      data.keys.length > 15 ||
      data.keys.some(
        (key) => !categoryPresets.some((preset) => preset.key === key),
      )
    )
      return send(422, {});
    let imported = 0;
    for (const preset of categoryPresets.filter((p) =>
      data.keys.includes(p.key),
    )) {
      if (
        categories.some(
          (c) =>
            c.preset_key === preset.key ||
            (c.kind === preset.kind &&
              c.name.trim().toLowerCase() === preset.name.trim().toLowerCase()),
        )
      )
        continue;
      categories.push({
        id: randomUUID(),
        name: preset.name,
        kind: preset.kind,
        colour: preset.colour,
        icon: preset.icon,
        preset_key: preset.key,
        subcategories: preset.subcategories.map((c) => ({
          ...c,
          id: randomUUID(),
        })),
      });
      imported++;
    }
    return send(200, { imported });
  }
  if (url.pathname === "/api/v1/categories" && request.method === "GET") {
    return send(200, { categories });
  }
  if (
    url.pathname.startsWith("/api/v1/categories") &&
    ["POST", "PUT", "DELETE"].includes(request.method)
  ) {
    if (
      request.method === "DELETE" &&
      url.pathname === categoryDeleteFailurePath
    ) {
      categoryDeleteFailurePath = null;
      return send(409, { detail: "Category is used by transactions" });
    }
    const segments = url.pathname.split("/").slice(4);
    if (!segments.length && request.method === "POST") {
      const data = await readBody(request);
      data.kind ??= "expense";
      if (!["expense", "income"].includes(data.kind)) return send(422, {});
      if (duplicateCategoryName(categories, data))
        return send(409, categoryNameConflict);
      const item = {
        ...data,
        id: randomUUID(),
        preset_key: null,
        subcategories: [],
      };
      categories.push(item);
      const { id, name, colour, icon } = item;
      return send(201, { id, name, colour, icon });
    }
    const root = categories.find((c) => c.id === segments[0]);
    if (!root) return send(404, { detail: "Category not found" });
    if (segments.length === 1) {
      if (request.method === "DELETE") {
        if (transactions.some((item) => item.category_id === root.id)) {
          return send(409, { detail: "Category is used by transactions" });
        }
        categories.splice(categories.indexOf(root), 1);
        return send(204);
      }
      const data = await readBody(request);
      data.kind ??= "expense";
      if (data.kind !== root.kind) return send(422, {});
      if (duplicateCategoryName(categories, data, root.id))
        return send(409, categoryNameConflict);
      Object.assign(root, data);
      const { id, name, colour, icon } = root;
      return send(200, { id, name, colour, icon });
    }
    if (segments.length === 2 && request.method === "POST") {
      const data = await readBody(request);
      if ("kind" in data) return send(422, {});
      if (duplicateCategoryName(root.subcategories, data))
        return send(409, categoryNameConflict);
      const item = { ...data, id: randomUUID() };
      root.subcategories.push(item);
      return send(201, item);
    }
    const child = root.subcategories.find((c) => c.id === segments[2]);
    if (!child) return send(404, { detail: "Category not found" });
    if (request.method === "DELETE") {
      if (transactions.some((item) => item.subcategory_id === child.id)) {
        return send(409, { detail: "Category is used by transactions" });
      }
      root.subcategories.splice(root.subcategories.indexOf(child), 1);
      return send(204);
    }
    const data = await readBody(request);
    if ("kind" in data) return send(422, {});
    if (duplicateCategoryName(root.subcategories, data, child.id))
      return send(409, categoryNameConflict);
    Object.assign(child, data);
    return send(200, child);
  }
  if (
    request.url === "/_test/account-save-failure" &&
    request.method === "POST"
  ) {
    failNextAccountSave = true;
    return send(200, { status: "ok" });
  }
  if (request.url === "/api/v1/account" && request.method === "GET") {
    return send(200, account);
  }
  if (
    (request.url === "/api/v1/account" && request.method === "PATCH") ||
    (request.url === "/api/v1/account/icon" && request.method === "PUT")
  ) {
    if (failNextAccountSave) {
      failNextAccountSave = false;
      return send(503, { detail: "Database is unavailable" });
    }
    const data = await readBody(request);
    account =
      request.method === "PATCH"
        ? { ...account, display_name: data.display_name }
        : { ...account, icon: data.icon, avatar_url: null };
    return send(200, account);
  }
  if (
    request.url === "/api/v1/account/avatar" &&
    ["PUT", "DELETE"].includes(request.method)
  ) {
    if (failNextAccountSave) {
      failNextAccountSave = false;
      return send(503, { detail: "Database is unavailable" });
    }
    if (request.method === "DELETE") {
      account = { ...account, avatar_url: null };
    } else {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      account = {
        ...account,
        avatar_url: `data:image/png;base64,${Buffer.concat(chunks).toString("base64")}`,
      };
    }
    return send(200, account);
  }
  if (request.url === "/api/v1/account" && request.method === "PUT") {
    if (failNextAccountSave) {
      failNextAccountSave = false;
      return send(503, { detail: "Database is unavailable" });
    }
    let body = "";
    for await (const chunk of request) body += chunk;
    const data = JSON.parse(body);
    account = { ...account, display_name: data.display_name, icon: data.icon };
    return send(200, account);
  }
  if (
    url.pathname === "/api/v1/wallets/icon-preview" &&
    request.method === "POST"
  ) {
    const { favicon_url } = await readBody(request);
    if (favicon_url.endsWith("/invalid.ico")) return send(422, {});
    if (favicon_url.endsWith("/unavailable.ico")) return send(503, {});
    if (favicon_url.endsWith("/slow.ico")) {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    return send(200, {
      icon_image_url: favicon_url.endsWith("/alternate.ico")
        ? "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHUlEQVR4nGNkaGD4z0ABYKJE86gBowaMGjCYDAAAVF4BnxYl3q4AAAAASUVORK5CYII="
        : `data:image/png;base64,${avatarPng.toString("base64")}`,
    });
  }
  if (url.pathname === "/api/v1/wallets" && request.method === "GET") {
    const page = Number(url.searchParams.get("page") ?? 1);
    const page_size = Number(url.searchParams.get("page_size") ?? 10);
    return send(200, {
      wallets: wallets
        .slice((page - 1) * page_size, page * page_size)
        .map((wallet) => withBalance(wallet, transactions)),
      page,
      page_size,
      total: wallets.length,
    });
  }
  if (request.url === "/api/v1/wallets" && request.method === "POST") {
    if (walletSaveFailureToken === request.headers.authorization) {
      walletSaveFailureToken = null;
      return send(503, { detail: "Database is unavailable" });
    }
    let body = "";
    for await (const chunk of request) body += chunk;
    const data = JSON.parse(body);
    const wallet = {
      id: randomUUID(),
      name: data.name,
      colour: data.colour,
      icon: data.icon,
      type: data.type ?? "bank",
      icon_image_url:
        data.icon === "custom"
          ? `data:image/png;base64,${avatarPng.toString("base64")}`
          : null,
      initial_amount: data.initial_amount ?? "0",
      currency: data.currency ?? "EUR",
      created_at: new Date().toISOString(),
    };
    wallets.push(wallet);
    return send(201, withBalance(wallet, transactions));
  }
  const walletMatch = url.pathname.match(/^\/api\/v1\/wallets\/([0-9a-f-]+)$/);
  if (walletMatch && ["PUT", "DELETE"].includes(request.method)) {
    const index = wallets.findIndex((wallet) => wallet.id === walletMatch[1]);
    if (index < 0) return send(404, { detail: "Wallet not found" });
    const used = transactions.some((item) =>
      [item.source_wallet_id, item.destination_wallet_id].includes(
        walletMatch[1],
      ),
    );
    if (request.method === "DELETE") {
      if (used) return send(409, { detail: "Wallet is used by transactions" });
      wallets.splice(index, 1);
      return send(204);
    }
    if (walletSaveFailureToken === request.headers.authorization) {
      walletSaveFailureToken = null;
      return send(503, { detail: "Database is unavailable" });
    }
    const data = await readBody(request);
    if (used && data.currency !== (wallets[index].currency ?? "EUR"))
      return send(409, {
        detail: "Currency cannot change while wallet has transactions",
      });
    wallets[index] = {
      ...wallets[index],
      ...data,
      initial_amount: data.initial_amount ?? "0",
      type: data.type ?? "bank",
      icon_image_url:
        data.icon === "custom"
          ? (wallets[index].icon_image_url ??
            `data:image/png;base64,${avatarPng.toString("base64")}`)
          : null,
    };
    return send(200, withBalance(wallets[index], transactions));
  }
  send(404, { detail: "Not found" });
});

server.listen(3102, "127.0.0.1");
process.on("SIGTERM", () => server.close());
