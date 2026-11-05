import { accountIcons, validAvatarUrl } from "./account.js";
import {
  CategoryInputError,
  categoryPath,
  validCategoryFields,
} from "./categories.js";
import {
  decimalAmount,
  faviconUrl,
  walletCurrencies,
  walletId,
  walletIcons,
  walletTypes,
} from "./wallets.js";
import {
  transactionId,
  transactionQuery,
  transactionSelection,
  validDate,
  validTransaction,
  validTransactionId,
} from "./transactions.js";
import {
  importPayload,
  validImportDocument,
  validImportValidation,
} from "./transaction-imports.js";
import { comparisonPayload, summaryYear } from "./summary.js";
import { validSettings } from "./settings.js";
import {
  assetGroups,
  assetId,
  negativeAmount,
  validAssetPosition,
} from "./assets.js";

export class BackendError extends Error {
  constructor(
    status,
    validationMessage = "Check the wallet name, colour, type, icon, currency, and initial amount. Custom favicons require a direct public HTTPS image URL (ICO, PNG, JPEG or WebP), up to 2 MiB and 4096 pixels per side, without redirects.",
  ) {
    super(
      status === 401
        ? "Your API session is not authorized. Sign out and sign in again."
        : status === 422
          ? validationMessage
          : status === 404
            ? "The requested item was not found or is no longer available."
            : status === 409
              ? "This category is used by transactions. Reassign or delete those transactions first."
              : status === 413
                ? "Profile images must not exceed 2 MiB."
                : status === 415
                  ? "Choose a PNG, JPEG, or WebP image."
                  : "The backend is unavailable or returned an invalid response.",
    );
    this.name = "BackendError";
    this.status = status;
  }
}

async function backendRequest({
  baseUrl,
  token,
  path,
  method = "GET",
  body,
  contentType = "application/json",
  fetchImpl = fetch,
  validationMessage,
  refusalHandler,
}) {
  if (!token) throw new Error("An API access token is required");
  let response;
  try {
    response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": contentType }),
      },
      ...(body === undefined
        ? {}
        : {
            body:
              contentType === "application/json" ? JSON.stringify(body) : body,
          }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    if (
      !(error instanceof TypeError) &&
      !["TimeoutError", "AbortError"].includes(error.name)
    ) {
      throw error;
    }
    console.error("Backend connection failed", { reason: error.name });
    throw new BackendError(503);
  }
  if (!response.ok) {
    if (refusalHandler) await refusalHandler(response);
    throw new BackendError(response.status, validationMessage);
  }
  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    console.error("Backend returned invalid JSON");
    throw new BackendError(502);
  }
}

export async function fetchProfile(options) {
  const profile = await backendRequest({ ...options, path: "/api/v1/me" });
  if (
    !profile ||
    typeof profile.subject !== "string" ||
    !profile.subject.trim()
  ) {
    console.error("Backend returned an invalid identity response");
    throw new BackendError(502);
  }
  return { subject: profile.subject };
}

function validateAccount(account) {
  if (
    !account ||
    typeof account.subject !== "string" ||
    !account.subject.trim() ||
    (account.display_name !== null &&
      (typeof account.display_name !== "string" ||
        !account.display_name.trim() ||
        [...account.display_name].length > 100)) ||
    !accountIcons.some((icon) => icon.value === account.icon) ||
    !validAvatarUrl(account.avatar_url)
  ) {
    console.error("Backend returned an invalid account response");
    throw new BackendError(502);
  }
  return {
    subject: account.subject,
    display_name: account.display_name,
    icon: account.icon,
    avatar_url: account.avatar_url,
  };
}

export async function fetchAccount(options) {
  return validateAccount(
    await backendRequest({ ...options, path: "/api/v1/account" }),
  );
}

function validateSettings(settings) {
  if (!validSettings(settings)) {
    console.error("Backend returned an invalid settings response");
    throw new BackendError(502);
  }
  return { theme: settings.theme, sidebar_order: settings.sidebar_order };
}

export async function fetchSettings(options) {
  return validateSettings(
    await backendRequest({ ...options, path: "/api/v1/settings" }),
  );
}

export async function putSettings(options, data) {
  return validateSettings(
    await backendRequest({
      ...options,
      path: "/api/v1/settings",
      method: "PUT",
      body: data,
      validationMessage:
        "Choose light or dark and include each sidebar feature exactly once.",
    }),
  );
}

export async function putAccount(options, data) {
  return validateAccount(
    await backendRequest({
      ...options,
      path: "/api/v1/account",
      method: "PUT",
      body: data,
      validationMessage: "Check the display name and profile icon.",
    }),
  );
}

export async function putAccountAvatar(options, file) {
  return validateAccount(
    await backendRequest({
      ...options,
      path: "/api/v1/account/avatar",
      method: "PUT",
      body: file,
      contentType: file.type,
      validationMessage:
        "Choose a valid, non-animated PNG, JPEG, or WebP image up to 4096 pixels per side.",
    }),
  );
}

export async function patchAccountName(options, data) {
  return validateAccount(
    await backendRequest({
      ...options,
      path: "/api/v1/account",
      method: "PATCH",
      body: data,
      validationMessage: "Enter a display name of 1 to 100 characters.",
    }),
  );
}

export async function putAccountIcon(options, icon) {
  return validateAccount(
    await backendRequest({
      ...options,
      path: "/api/v1/account/icon",
      method: "PUT",
      body: { icon },
      validationMessage: "Choose a supported profile icon.",
    }),
  );
}

export async function removeAccountAvatar(options) {
  return validateAccount(
    await backendRequest({
      ...options,
      path: "/api/v1/account/avatar",
      method: "DELETE",
    }),
  );
}

function categoryFields(item) {
  if (!validCategoryFields(item)) {
    console.error("Backend returned invalid category attributes");
    throw new BackendError(502);
  }
  return { name: item.name, colour: item.colour, icon: item.icon };
}

function categoryItem(item) {
  const fields = categoryFields(item);
  if (typeof item.id !== "string" || !item.id) {
    console.error("Backend returned an invalid category identifier");
    throw new BackendError(502);
  }
  try {
    categoryPath({ id: item.id });
  } catch (error) {
    if (!(error instanceof CategoryInputError)) throw error;
    console.error("Backend returned an invalid category identifier");
    throw new BackendError(502);
  }
  return { ...fields, id: item.id };
}

export async function fetchCategories(options) {
  const data = await backendRequest({ ...options, path: "/api/v1/categories" });
  if (!Array.isArray(data?.categories)) {
    console.error("Backend returned an invalid category list");
    throw new BackendError(502);
  }
  return data.categories.map((category) => {
    if (
      !Array.isArray(category?.subcategories) ||
      !["expense", "income"].includes(category.kind) ||
      !(
        category.preset_key === null || typeof category.preset_key === "string"
      ) ||
      category.subcategories.some(
        (child) =>
          child?.subcategories !== undefined || child?.kind !== undefined,
      )
    ) {
      console.error("Backend returned an invalid category hierarchy");
      throw new BackendError(502);
    }
    return {
      ...categoryItem(category),
      kind: category.kind,
      preset_key: category.preset_key,
      subcategories: category.subcategories.map(categoryItem),
    };
  });
}

export async function fetchCategoryPresets(options) {
  const data = await backendRequest({
    ...options,
    path: "/api/v1/categories/presets",
  });
  if (!Array.isArray(data?.presets)) {
    console.error("Backend returned an invalid category catalogue");
    throw new BackendError(502);
  }
  return data.presets.map((preset) => {
    if (
      typeof preset?.key !== "string" ||
      !["expense", "income"].includes(preset.kind) ||
      !/^[a-z][a-z-]*$/.test(preset.key) ||
      !Array.isArray(preset.subcategories) ||
      preset.subcategories.some((child) => child?.kind !== undefined)
    ) {
      console.error("Backend returned an invalid category preset");
      throw new BackendError(502);
    }
    return {
      ...categoryFields(preset),
      key: preset.key,
      kind: preset.kind,
      subcategories: preset.subcategories.map(categoryFields),
    };
  });
}

export async function saveCategory(options, target, data) {
  return categoryItem(
    await backendRequest({
      ...options,
      path: categoryPath(target),
      method: target.id ? "PUT" : "POST",
      body: data,
      validationMessage: "Check the category name, colour, and icon.",
      refusalHandler: (response) => {
        if (response.status === 409) {
          const error = new BackendError(409);
          error.message =
            "A category with this name already exists at this level. Choose a unique name.";
          throw error;
        }
      },
    }),
  );
}

export async function removeCategory(options, target) {
  if (!target.id)
    throw new Error("A category identifier is required for deletion");
  await backendRequest({
    ...options,
    path: categoryPath(target),
    method: "DELETE",
  });
}

export async function importCategoryPresets(options, keys) {
  const data = await backendRequest({
    ...options,
    path: "/api/v1/categories/import",
    method: "POST",
    body: { keys },
    validationMessage: "Select one or more valid predefined category groups.",
  });
  if (
    !Number.isInteger(data?.imported) ||
    data.imported < 0 ||
    data.imported > keys.length
  ) {
    console.error("Backend returned an invalid category import result");
    throw new BackendError(502);
  }
  return data.imported;
}

function validateWallet(wallet) {
  if (
    !wallet ||
    typeof wallet.id !== "string" ||
    !wallet.id ||
    typeof wallet.name !== "string" ||
    !wallet.name.trim() ||
    !/^#[0-9a-f]{6}$/i.test(wallet.colour) ||
    !walletIcons.some((icon) => icon.value === wallet.icon) ||
    !walletTypes.includes(wallet.type) ||
    !validAvatarUrl(wallet.icon_image_url) ||
    (wallet.icon === "custom") !== (wallet.icon_image_url !== null) ||
    typeof wallet.initial_amount !== "string" ||
    !decimalAmount.test(wallet.initial_amount) ||
    typeof wallet.current_amount !== "string" ||
    !decimalAmount.test(wallet.current_amount) ||
    !walletCurrencies.includes(wallet.currency) ||
    !validDate(wallet.balance_as_of)
  ) {
    console.error("Backend returned an invalid wallet response");
    throw new BackendError(502);
  }
  return {
    id: wallet.id,
    name: wallet.name,
    colour: wallet.colour,
    icon: wallet.icon,
    type: wallet.type,
    icon_image_url: wallet.icon_image_url,
    initial_amount: wallet.initial_amount,
    current_amount: wallet.current_amount,
    currency: wallet.currency,
    balance_as_of: wallet.balance_as_of,
  };
}

export async function fetchWallets(options, page = 1) {
  const data = await backendRequest({
    ...options,
    path: `/api/v1/wallets?page=${page}&page_size=10`,
  });
  if (
    !Array.isArray(data?.wallets) ||
    data.page !== page ||
    data.page_size !== 10 ||
    !Number.isSafeInteger(data.total) ||
    data.total < 0 ||
    data.wallets.length > data.page_size ||
    data.wallets.length !==
      Math.min(
        data.page_size,
        Math.max(0, data.total - (page - 1) * data.page_size),
      )
  ) {
    console.error("Backend returned an invalid wallet list");
    throw new BackendError(502);
  }
  return { ...data, wallets: data.wallets.map(validateWallet) };
}

export async function postWallet(options, data) {
  const wallet = await backendRequest({
    ...options,
    path: "/api/v1/wallets",
    method: "POST",
    body: data,
  });
  return validateWallet(wallet);
}

export async function postWalletIconPreview(options, url) {
  const data = await backendRequest({
    ...options,
    path: "/api/v1/wallets/icon-preview",
    method: "POST",
    body: { favicon_url: faviconUrl(url) },
    validationMessage:
      "The favicon could not be loaded. Use a direct public HTTPS ICO, PNG, JPEG or WebP image up to 2 MiB and 4096 pixels per side, without redirects.",
  });
  if (!data?.icon_image_url || !validAvatarUrl(data.icon_image_url)) {
    console.error("Backend returned an invalid wallet icon preview");
    throw new BackendError(502);
  }
  return data.icon_image_url;
}

async function walletRefusal(response, deleting = false) {
  if (response.status !== 409) return;
  const error = new BackendError(409);
  error.message = deleting
    ? "This wallet is used by transactions. Reassign or delete those transactions first."
    : "Currency cannot change while this wallet has transactions. Keep its existing currency.";
  throw error;
}

export async function putWallet(options, id, data) {
  return validateWallet(
    await backendRequest({
      ...options,
      path: `/api/v1/wallets/${walletId(id)}`,
      method: "PUT",
      body: data,
      refusalHandler: (response) => walletRefusal(response),
    }),
  );
}

export async function removeWallet(options, id) {
  await backendRequest({
    ...options,
    path: `/api/v1/wallets/${walletId(id)}`,
    method: "DELETE",
    refusalHandler: (response) => walletRefusal(response, true),
  });
}

function validateTransaction(item, occurrence = false) {
  if (
    !validTransaction(item) ||
    !validTransactionId(item.id) ||
    typeof item.is_pinned !== "boolean" ||
    typeof item.created_at !== "string" ||
    Number.isNaN(Date.parse(item.created_at)) ||
    (occurrence &&
      (!validDate(item.occurrence_date) ||
        !Number.isSafeInteger(item.occurrence_number) ||
        item.occurrence_number < 1 ||
        typeof item.source_wallet_name !== "string" ||
        !item.source_wallet_name.trim() ||
        !walletCurrencies.includes(item.currency) ||
        (item.type === "balance_adjustment"
          ? item.category_name !== null
          : typeof item.category_name !== "string" ||
            !item.category_name.trim()) ||
        (item.destination_wallet_id === null
          ? item.destination_wallet_name !== null
          : typeof item.destination_wallet_name !== "string" ||
            !item.destination_wallet_name.trim()) ||
        (item.subcategory_id === null
          ? item.subcategory_name !== null
          : typeof item.subcategory_name !== "string" ||
            !item.subcategory_name.trim())))
  ) {
    console.error("Backend returned an invalid transaction");
    throw new BackendError(502);
  }
  const fields = [
    "id",
    "description",
    "amount",
    "date",
    "type",
    "source_wallet_id",
    "destination_wallet_id",
    "category_id",
    "subcategory_id",
    "recurrence",
    "recurrence_count",
    "created_at",
    "is_pinned",
    ...(occurrence
      ? [
          "occurrence_date",
          "occurrence_number",
          "source_wallet_name",
          "destination_wallet_name",
          "category_name",
          "subcategory_name",
          "currency",
        ]
      : []),
  ];
  return Object.fromEntries(fields.map((key) => [key, item[key]]));
}

function validateTransactionSummary(summary, total) {
  const validAmount = (value, signed = false) =>
    typeof value === "string" &&
    decimalAmount.test(value) &&
    (signed || !value.startsWith("-"));
  if (
    !Array.isArray(summary?.currencies) ||
    !Array.isArray(summary.wallet_expenses) ||
    (total === 0
      ? summary.currencies.length !== 0
      : summary.currencies.length === 0) ||
    summary.currencies.some(
      (item) =>
        !item ||
        !walletCurrencies.includes(item.currency) ||
        !["income", "transfer"].every((key) => validAmount(item[key])) ||
        !validAmount(item.expense, true) ||
        !validAmount(item.net, true),
    ) ||
    new Set(summary.currencies.map((item) => item.currency)).size !==
      summary.currencies.length ||
    summary.wallet_expenses.some(
      (item) =>
        !item ||
        !validTransactionId(item.wallet_id) ||
        typeof item.wallet_name !== "string" ||
        !item.wallet_name.trim() ||
        !summary.currencies.some((total) => total.currency === item.currency) ||
        !validAmount(item.amount, true) ||
        !/[1-9]/.test(item.amount.split(/[eE]/)[0]),
    ) ||
    new Set(summary.wallet_expenses.map((item) => item.wallet_id)).size !==
      summary.wallet_expenses.length
  ) {
    console.error("Backend returned an invalid transaction summary");
    throw new BackendError(502);
  }
  return {
    currencies: summary.currencies.map(
      ({ currency, income, expense, transfer, net }) => ({
        currency,
        income,
        expense,
        transfer,
        net,
      }),
    ),
    wallet_expenses: summary.wallet_expenses.map(
      ({ wallet_id, wallet_name, currency, amount }) => ({
        wallet_id,
        wallet_name,
        currency,
        amount,
      }),
    ),
  };
}

export async function fetchTransactions(options, filters) {
  const data = await backendRequest({
    ...options,
    path: `/api/v1/transactions?${transactionQuery(filters)}&page_size=10`,
    validationMessage: "Choose valid transaction filters and dates.",
  });
  if (
    !Array.isArray(data?.transactions) ||
    data.page !== filters.page ||
    data.page_size !== 10 ||
    !Number.isSafeInteger(data.total) ||
    data.total < 0 ||
    !validDate(data.as_of) ||
    data.transactions.length !==
      Math.min(10, Math.max(0, data.total - (data.page - 1) * 10))
  ) {
    console.error("Backend returned an invalid transaction list");
    throw new BackendError(502);
  }
  return {
    transactions: data.transactions.map((item) =>
      validateTransaction(item, true),
    ),
    page: data.page,
    page_size: data.page_size,
    total: data.total,
    as_of: data.as_of,
    summary: validateTransactionSummary(data.summary, data.total),
  };
}

export async function fetchTransactionOptions(options) {
  const data = await backendRequest({
    ...options,
    path: "/api/v1/transactions/options",
  });
  if (
    !Array.isArray(data?.wallets) ||
    data.wallets.some(
      (wallet) =>
        !validTransactionId(wallet?.id) ||
        typeof wallet.name !== "string" ||
        !wallet.name.trim() ||
        !walletCurrencies.includes(wallet.currency) ||
        !/^#[0-9a-f]{6}$/i.test(wallet.colour) ||
        !walletIcons.some((option) => option.value === wallet.icon) ||
        !validAvatarUrl(wallet.icon_image_url) ||
        (wallet.icon === "custom" && wallet.icon_image_url === null),
    )
  ) {
    console.error("Backend returned invalid transaction wallet options");
    throw new BackendError(502);
  }
  return data.wallets.map(
    ({ id, name, currency, colour, icon, icon_image_url }) => ({
      id,
      name,
      currency,
      colour,
      icon,
      icon_image_url,
    }),
  );
}

async function mutateTransactions(options, ids, changes) {
  transactionSelection(ids);
  const data = await backendRequest({
    ...options,
    method: changes ? "PATCH" : "DELETE",
    path: "/api/v1/transactions/bulk",
    body: changes ? { ids, changes } : { ids },
    validationMessage:
      "Changes must be valid for every selected transaction. No transactions were changed.",
  });
  if (data?.count !== ids.length) {
    console.error("Backend returned an invalid bulk transaction result");
    throw new BackendError(502);
  }
  return data;
}

export async function saveTransactions(options, { ids, changes }) {
  return mutateTransactions(options, ids, changes);
}

export async function removeTransactions(options, ids) {
  return mutateTransactions(options, ids);
}

export async function fetchExpenseSummary(options, year) {
  summaryYear(String(year));
  const data = await backendRequest({
    ...options,
    path: `/api/v1/summary?year=${year}`,
    validationMessage: "Choose a year between 1 and 9999.",
  });
  return validateExpenseSummary(data, year);
}

function validateExpenseSummary(data, year, nonnegative = false) {
  const validTotals = (item) =>
    Array.isArray(item?.months) &&
    item.months.length === 12 &&
    [...item.months, item.total].every(
      (amount) =>
        typeof amount === "string" &&
        decimalAmount.test(amount) &&
        (!nonnegative || !amount.startsWith("-")),
    );
  const validName = (item) =>
    typeof item?.name === "string" && Boolean(item.name.trim());
  const uniqueIds = (items) =>
    new Set(items.map((item) => item?.id)).size === items.length;
  if (
    data?.year !== year ||
    !validDate(data.as_of) ||
    !Array.isArray(data.currencies) ||
    new Set(data.currencies.map((item) => item?.currency)).size !==
      data.currencies.length ||
    data.currencies.some(
      (item) =>
        !walletCurrencies.includes(item?.currency) ||
        !validTotals(item) ||
        !Array.isArray(item.categories) ||
        !item.categories.length ||
        !uniqueIds(item.categories) ||
        item.categories.some(
          (category) =>
            !validTransactionId(category?.id) ||
            !validName(category) ||
            !validTotals(category) ||
            !Array.isArray(category.subcategories) ||
            !category.subcategories.length ||
            !uniqueIds(category.subcategories) ||
            category.subcategories.some(
              (child) =>
                (child?.id !== null && !validTransactionId(child?.id)) ||
                !validName(child) ||
                !validTotals(child),
            ),
        ),
    )
  ) {
    console.error("Backend returned an invalid expense summary");
    throw new BackendError(502);
  }
  const totals = ({ months, total }) => ({ months, total });
  return {
    year: data.year,
    as_of: data.as_of,
    currencies: data.currencies.map((item) => ({
      currency: item.currency,
      ...totals(item),
      categories: item.categories.map((category) => ({
        id: category.id,
        name: category.name,
        ...totals(category),
        subcategories: category.subcategories.map((child) => ({
          id: child.id,
          name: child.name,
          ...totals(child),
        })),
      })),
    })),
  };
}

function validatePlotPoints(points, keys) {
  if (
    !Array.isArray(points) ||
    (keys &&
      (points.length !== keys.length ||
        points.some((point, index) => point?.key !== keys[index]))) ||
    points.some(
      (point) =>
        !point ||
        typeof point.key !== "string" ||
        !point.key ||
        typeof point.label !== "string" ||
        !point.label.trim() ||
        typeof point.amount !== "string" ||
        !decimalAmount.test(point.amount) ||
        !Number.isInteger(point.value) ||
        point.value < -10000 ||
        point.value > 10000,
    ) ||
    new Set(points.map((point) => point?.key)).size !== points.length
  ) {
    console.error("Backend returned invalid expense plot data");
    throw new BackendError(502);
  }
  return points.map(({ key, label, amount, value }) => ({
    key,
    label,
    amount,
    value,
  }));
}

function validateMoneyAxisTicks(ticks, signed) {
  const coordinates = signed
    ? [-10000, -5000, 0, 5000, 10000]
    : [0, 5000, 10000];
  if (
    !Array.isArray(ticks) ||
    ticks.length !== coordinates.length ||
    ticks.some(
      (tick, index) =>
        tick?.value !== coordinates[index] ||
        typeof tick.amount !== "string" ||
        !decimalAmount.test(tick.amount) ||
        typeof tick.label !== "string" ||
        !decimalAmount.test(tick.label),
    )
  ) {
    console.error("Backend returned invalid monetary axis ticks");
    throw new BackendError(502);
  }
  return ticks.map(({ value, amount, label }) => ({ value, amount, label }));
}

export async function fetchAssetSummary(options, year) {
  summaryYear(String(year));
  const data = await backendRequest({
    ...options,
    path: `/api/v1/assets?year=${year}`,
  });
  const validAmount = (value) =>
    value === null || (typeof value === "string" && decimalAmount.test(value));
  const validValues = (values) =>
    values &&
    validAmount(values.opening) &&
    validAmount(values.latest) &&
    Array.isArray(values.months) &&
    values.months.length === 12 &&
    values.months.every(validAmount);
  const unique = (items, key) =>
    new Set(items.map((item) => item?.[key])).size === items.length;
  if (
    data?.year !== year ||
    !validDate(data.as_of) ||
    !Array.isArray(data.currencies) ||
    !unique(data.currencies, "currency") ||
    data.currencies.some(
      (item) =>
        !walletCurrencies.includes(item?.currency) ||
        ![
          "assets",
          "liabilities",
          "net_worth",
          "change",
          "change_percent",
        ].every((key) => validValues(item[key])) ||
        !Array.isArray(item.missing_values) ||
        item.missing_values.length !== 13 ||
        !item.missing_values.every(
          (value) => Number.isInteger(value) && value >= 0,
        ) ||
        !Array.isArray(item.groups) ||
        !item.groups.length ||
        !unique(item.groups, "key") ||
        item.groups.some(
          (group) =>
            !assetGroups.some((option) => option.value === group?.key) ||
            typeof group.label !== "string" ||
            !group.label.trim() ||
            !validValues(group.values) ||
            !Array.isArray(group.holdings) ||
            !group.holdings.length ||
            !unique(group.holdings, "id") ||
            group.holdings.some(
              (holding) =>
                !validAssetPosition(holding) ||
                holding.asset_group !== group.key ||
                holding.currency !== item.currency ||
                !["wallet", "asset"].includes(holding.source) ||
                !validValues(holding.values),
            ),
        ) ||
        !Array.isArray(item.trend) ||
        item.trend.length !== 12 ||
        item.trend.some(
          (point, index) =>
            point?.key !== String(index + 1) ||
            typeof point.label !== "string" ||
            !point.label.trim() ||
            !validAmount(point.amount) ||
            point.amount !== item.net_worth.months[index] ||
            (point.amount === null
              ? point.value !== null
              : !Number.isInteger(point.value) ||
                Math.abs(point.value) > 10000),
        ),
    )
  ) {
    console.error("Backend returned an invalid asset summary");
    throw new BackendError(502);
  }
  const values = ({ opening, months, latest }) => ({ opening, months, latest });
  return {
    year: data.year,
    as_of: data.as_of,
    currencies: data.currencies.map((item) => {
      const allocatedGroups = item.groups.filter(
        (group) => group.key !== "liabilities" && group.values.latest !== null,
      );
      const allocation = validatePlotPoints(
        item.allocation,
        allocatedGroups.map((group) => group.key),
      );
      if (
        allocation.some(
          (point, index) =>
            point.amount !== allocatedGroups[index].values.latest,
        )
      ) {
        console.error("Backend returned inconsistent asset allocation");
        throw new BackendError(502);
      }
      return {
        currency: item.currency,
        groups: item.groups.map((group) => ({
          key: group.key,
          label: group.label,
          values: values(group.values),
          holdings: group.holdings.map((holding) => ({
            id: holding.id,
            name: holding.name,
            asset_group: holding.asset_group,
            currency: holding.currency,
            source: holding.source,
            values: values(holding.values),
          })),
        })),
        ...Object.fromEntries(
          [
            "assets",
            "liabilities",
            "net_worth",
            "change",
            "change_percent",
          ].map((key) => [key, values(item[key])]),
        ),
        missing_values: item.missing_values,
        trend: item.trend.map(({ key, label, amount, value }) => ({
          key,
          label,
          amount,
          value,
        })),
        allocation,
        net_worth_ticks: validateMoneyAxisTicks(item.net_worth_ticks, true),
        allocation_ticks: validateMoneyAxisTicks(
          item.allocation_ticks,
          allocation.some((point) => negativeAmount(point.amount)),
        ),
      };
    }),
  };
}

export async function postAsset(options, data) {
  const result = await backendRequest({
    ...options,
    path: "/api/v1/assets",
    method: "POST",
    body: data,
    validationMessage:
      "Check the asset name, group, currency, date and nonnegative valuation.",
  });
  if (!validAssetPosition(result)) {
    console.error("Backend returned an invalid asset");
    throw new BackendError(502);
  }
  return {
    id: result.id,
    name: result.name,
    asset_group: result.asset_group,
    currency: result.currency,
  };
}

export async function putAssetValuation(options, id, data) {
  return backendRequest({
    ...options,
    path: `/api/v1/assets/${assetId(id)}/valuations`,
    method: "PUT",
    body: data,
    validationMessage:
      "Enter a nonnegative exact valuation with a date no later than today.",
  });
}

export async function removeAsset(options, id) {
  return backendRequest({
    ...options,
    path: `/api/v1/assets/${assetId(id)}`,
    method: "DELETE",
  });
}

export async function fetchExpenseAnalysis(options, year) {
  summaryYear(String(year));
  const data = await backendRequest({
    ...options,
    path: `/api/v1/summary/analysis?year=${year}`,
  });
  const summary = validateExpenseSummary(data?.summary, year);
  const income_summary = validateExpenseSummary(
    data?.income_summary,
    year,
    true,
  );
  const currencies = [
    ...new Set([
      ...summary.currencies.map((item) => item.currency),
      ...income_summary.currencies.map((item) => item.currency),
    ]),
  ].sort();
  if (
    income_summary.as_of !== summary.as_of ||
    !Array.isArray(data.charts) ||
    data.charts.length !== currencies.length ||
    data.charts.some(
      (item, index) =>
        item?.currency !== currencies[index] ||
        !Array.isArray(item.ranking) ||
        item.ranking.length !==
          Math.min(
            10,
            summary.currencies.find(
              (currency) => currency.currency === item?.currency,
            )?.categories.length ?? 0,
          ),
    )
  ) {
    console.error("Backend returned invalid expense charts");
    throw new BackendError(502);
  }
  const monthCount = 12;
  return {
    summary,
    income_summary,
    charts: data.charts.map((item) => {
      const expenses = summary.currencies.find(
        (currency) => currency.currency === item.currency,
      );
      const incomes = income_summary.currencies.find(
        (currency) => currency.currency === item.currency,
      );
      const ranking = validatePlotPoints(item.ranking);
      if (
        [
          item.ranking_sum,
          item.ranking_average,
          item.totals?.expenses,
          item.totals?.income,
          item.totals?.net,
        ].some(
          (amount) => typeof amount !== "string" || !decimalAmount.test(amount),
        ) ||
        item.totals?.expenses !== (expenses?.total ?? "0") ||
        item.totals?.income !== (incomes?.total ?? "0") ||
        ranking.some(
          (point) =>
            !expenses?.categories.some(
              (category) =>
                category.id === point.key &&
                category.name === point.label &&
                category.total === point.amount,
            ),
        )
      ) {
        console.error("Backend returned inconsistent category chart data");
        throw new BackendError(502);
      }
      const trend = validatePlotPoints(
        item.trend,
        Array.from({ length: monthCount }, (_, index) => String(index + 1)),
      );
      const income_trend = validatePlotPoints(
        item.income_trend,
        Array.from({ length: monthCount }, (_, index) => String(index + 1)),
      );
      const net_trend = validatePlotPoints(
        item.net_trend,
        Array.from({ length: monthCount }, (_, index) => String(index + 1)),
      );
      if (
        trend.some(
          (point, index) => point.amount !== (expenses?.months[index] ?? "0"),
        ) ||
        income_trend.some(
          (point, index) =>
            point.amount !== (incomes?.months[index] ?? "0") || point.value < 0,
        )
      ) {
        console.error("Backend returned inconsistent monthly chart data");
        throw new BackendError(502);
      }
      return {
        currency: item.currency,
        ranking,
        ranking_sum: item.ranking_sum,
        ranking_average: item.ranking_average,
        totals: {
          expenses: item.totals.expenses,
          income: item.totals.income,
          net: item.totals.net,
        },
        trend,
        income_trend,
        net_trend,
        cashflow_ticks: validateMoneyAxisTicks(
          item.cashflow_ticks,
          trend.some((point) => point.amount.startsWith("-")),
        ),
        net_ticks: validateMoneyAxisTicks(item.net_ticks, true),
      };
    }),
  };
}

export async function postExpenseComparison(options, request) {
  const payload = comparisonPayload(request);
  const data = await backendRequest({
    ...options,
    path: "/api/v1/summary/compare",
    method: "POST",
    body: payload,
    validationMessage:
      "Choose two to six distinct periods that have started by today's UTC date.",
  });
  if (
    data?.kind !== payload.kind ||
    !validDate(data.as_of) ||
    !Array.isArray(data.periods) ||
    data.periods.length !== payload.periods.length ||
    data.periods.some(
      (period, index) =>
        period?.key !== `p${index}` ||
        period.year !== payload.periods[index].year ||
        period.month !== payload.periods[index].month ||
        period.end_year !== (payload.periods[index].end_year ?? null) ||
        !Number.isInteger(period.years) ||
        period.years !== (period.end_year ?? period.year) - period.year + 1 ||
        typeof period.label !== "string" ||
        !period.label.trim() ||
        !Number.isInteger(period.months) ||
        period.months < 1 ||
        period.months !==
          (payload.kind === "month"
            ? 1
            : (period.years - 1) * 12 +
              ((period.end_year ?? period.year) ===
              Number(data.as_of.slice(0, 4))
                ? Number(data.as_of.slice(5, 7))
                : 12)),
    ) ||
    !Array.isArray(data.currencies) ||
    new Set(data.currencies.map((item) => item?.currency)).size !==
      data.currencies.length ||
    data.currencies.some(
      (item) =>
        !walletCurrencies.includes(item?.currency) ||
        !Array.isArray(item.categories) ||
        !item.categories.length ||
        new Set(item.categories.map((category) => category?.id)).size !==
          item.categories.length ||
        item.categories.some(
          (category) =>
            !validTransactionId(category?.id) ||
            typeof category.name !== "string" ||
            !category.name.trim(),
        ),
    )
  ) {
    console.error("Backend returned an invalid expense comparison");
    throw new BackendError(502);
  }
  const periods = data.periods.map(
    ({ key, label, year, end_year, month, months, years }) => ({
      key,
      label,
      year,
      end_year,
      month,
      months,
      years,
    }),
  );
  const keys = periods.map((period) => period.key);
  return {
    kind: data.kind,
    as_of: data.as_of,
    periods,
    currencies: data.currencies.map((item) => ({
      currency: item.currency,
      totals: validatePlotPoints(item.totals, keys),
      categories: item.categories.map(({ id, name, points }) => ({
        id,
        name,
        points: validatePlotPoints(points, keys),
      })),
    })),
  };
}

export async function saveTransaction(options, id, data) {
  return validateTransaction(
    await backendRequest({
      ...options,
      path: id
        ? `/api/v1/transactions/${transactionId(id)}`
        : "/api/v1/transactions",
      method: id ? "PUT" : "POST",
      body: data,
      validationMessage:
        "Check the transaction fields and recurrence. Transfers require wallets with the same currency.",
    }),
  );
}

export async function removeTransaction(options, id) {
  await backendRequest({
    ...options,
    path: `/api/v1/transactions/${transactionId(id)}`,
    method: "DELETE",
  });
}

async function importRefusal(response, request) {
  const error = new BackendError(
    response.status,
    "Check the CSV data and field mapping.",
  );
  if ([413, 415, 422, 409].includes(response.status)) {
    let body;
    try {
      body = await response.json();
    } catch (parseError) {
      if (!(parseError instanceof SyntaxError)) throw parseError;
      console.error("Backend returned invalid import error JSON");
      throw new BackendError(502);
    }
    if (typeof body?.detail !== "string" || body.detail.length > 500) {
      console.error("Backend returned an invalid import error");
      throw new BackendError(502);
    }
    error.message = body.detail;
    if (body.validation !== undefined) {
      if (!request || !validImportValidation(body.validation, request)) {
        console.error("Backend returned an invalid import validation");
        throw new BackendError(502);
      }
      error.validation = body.validation;
    }
  }
  throw error;
}

export async function uploadTransactionCSV(options, file, delimiter) {
  const document = await backendRequest({
    ...options,
    path: `/api/v1/transactions/import/upload?${new URLSearchParams({ delimiter })}`,
    method: "POST",
    body: file,
    contentType: "text/csv",
    refusalHandler: (response) => importRefusal(response),
  });
  if (!validImportDocument(document)) {
    console.error("Backend returned an invalid CSV document");
    throw new BackendError(502);
  }
  return {
    headers: document.headers,
    rows: document.rows,
    mapping: document.mapping,
  };
}

export async function validateTransactionImport(options, data) {
  const request = importPayload(data);
  const report = await backendRequest({
    ...options,
    path: "/api/v1/transactions/import/validate",
    method: "POST",
    body: request,
    refusalHandler: (response) => importRefusal(response, request),
  });
  if (!validImportValidation(report, request)) {
    console.error("Backend returned invalid import rows");
    throw new BackendError(502);
  }
  return report;
}

export async function confirmTransactionImport(options, data) {
  const request = importPayload(data);
  const result = await backendRequest({
    ...options,
    path: "/api/v1/transactions/import/confirm",
    method: "POST",
    body: request,
    refusalHandler: (response) => importRefusal(response, request),
  });
  if (
    !Number.isInteger(result?.imported) ||
    result.imported < 1 ||
    result.imported !== request.rows.filter((row) => row.included).length
  ) {
    console.error("Backend returned an invalid import result");
    throw new BackendError(502);
  }
  return { imported: result.imported };
}
