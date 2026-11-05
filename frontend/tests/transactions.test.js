import assert from "node:assert/strict";
import test from "node:test";
import {
  BackendError,
  fetchTransactions,
  fetchTransactionOptions,
  removeTransaction,
  saveTransaction,
  saveTransactions,
  removeTransactions,
} from "../lib/api-client.js";
import {
  TransactionInputError,
  transactionFilters,
  transactionId,
  transactionPayload,
  transactionQuery,
  transactionView,
  transactionViewQuery,
  transactionPeriodQuery,
  transactionMonthLabel,
  shiftTransactionMonth,
  transactionYearMonth,
  validDate,
  bulkTransactionPayload,
  transactionSelection,
  transactionDateLabel,
  transactionDisplayAmount,
  adjustmentEffectiveDate,
} from "../lib/transactions.js";

const id = "00582a98-a07f-4fdd-8458-54b590b29cd6";
const destination = "d04d9638-f758-43ca-bc6d-902f3fa39db2";
const input = {
  description: "Lunch",
  amount: "12345678901234567890.123456789012345678",
  date: "2026-01-31",
  type: "expense",
  source_wallet_id: id,
  destination_wallet_id: null,
  category_id: id,
  subcategory_id: null,
  recurrence: null,
  recurrence_count: null,
};
const item = {
  ...input,
  id,
  is_pinned: false,
  created_at: "2026-01-31T12:00:00Z",
};
const occurrence = {
  ...item,
  occurrence_date: item.date,
  occurrence_number: 1,
  source_wallet_name: "Everyday",
  destination_wallet_name: null,
  category_name: "Food",
  subcategory_name: null,
  currency: "EUR",
};
const summary = {
  currencies: [
    {
      currency: "EUR",
      income: "0",
      expense: input.amount,
      transfer: "0",
      net: `-${input.amount}`,
    },
  ],
  wallet_expenses: [
    {
      wallet_id: id,
      wallet_name: "Everyday",
      currency: "EUR",
      amount: input.amount,
    },
  ],
};
const options = {
  baseUrl: "https://api.example.test",
  token: "server-only-token",
};

function form(changes = {}) {
  const result = new FormData();
  for (const [key, value] of Object.entries({ ...input, ...changes })) {
    result.set(key, value === null ? "" : value);
  }
  return result;
}

test("balance adjustments are signed, category-free, next-month reconciliations", async () => {
  const adjustment = {
    ...input,
    type: "balance_adjustment",
    category_id: null,
    amount: "-25.123456789012345678",
  };
  assert.deepEqual(transactionPayload(form(adjustment)), adjustment);
  assert.deepEqual(transactionDisplayAmount(adjustment), {
    amount: "25.123456789012345678",
    sign: "-",
    positive: false,
  });
  assert.equal(
    transactionDisplayAmount({ ...adjustment, amount: "25" }).sign,
    "+",
  );
  assert.equal(adjustmentEffectiveDate("2024-02-29"), "2024-03-01");
  assert.equal(adjustmentEffectiveDate("2024-12-31"), "2025-01-01");
  for (const change of [
    { category_id: id },
    { recurrence: "monthly" },
    { destination_wallet_id: destination },
    { amount: "0" },
    { date: "9999-12-01" },
  ])
    assert.throws(
      () => transactionPayload(form({ ...adjustment, ...change })),
      TransactionInputError,
    );

  const data = form(adjustment);
  data.append("ids", id);
  data.append("fields", "type");
  assert.deepEqual(bulkTransactionPayload(data).changes, {
    type: "balance_adjustment",
    category_id: null,
    subcategory_id: null,
    destination_wallet_id: null,
    recurrence: null,
    recurrence_count: null,
  });
  const neutral = {
    ...occurrence,
    ...adjustment,
    category_name: null,
  };
  const result = await fetchTransactions(
    {
      ...options,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            transactions: [neutral],
            page: 1,
            page_size: 10,
            total: 1,
            as_of: "2026-01-31",
            summary: {
              currencies: [
                {
                  currency: "EUR",
                  income: "0",
                  expense: "0",
                  transfer: "0",
                  net: "0",
                },
              ],
              wallet_expenses: [],
            },
          }),
        ),
    },
    { page: 1 },
  );
  assert.equal(result.transactions[0].type, "balance_adjustment");
});

test("bulk changes include only checked fields, preserve exact values and reject invalid selections", () => {
  const data = form();
  data.append("ids", id);
  data.append("ids", destination);
  data.append("fields", "amount");
  data.append("fields", "description");
  assert.deepEqual(bulkTransactionPayload(data), {
    ids: [id, destination],
    changes: { amount: input.amount, description: "Lunch" },
  });
  for (const ids of [[], [id, id], [id, "forged"], Array(101).fill(id)]) {
    assert.throws(() => transactionSelection(ids), TransactionInputError);
  }
  data.append("fields", "owner_subject");
  assert.throws(() => bulkTransactionPayload(data), TransactionInputError);
  const category = new FormData();
  category.append("ids", id);
  category.append("fields", "category_id");
  category.set("category_id", destination);
  assert.deepEqual(bulkTransactionPayload(category).changes, {
    category_id: destination,
    subcategory_id: null,
  });
  const pin = new FormData();
  pin.append("ids", id);
  pin.append("fields", "is_pinned");
  pin.set("is_pinned", "false");
  assert.deepEqual(bulkTransactionPayload(pin).changes, { is_pinned: false });
  pin.set("is_pinned", "maybe");
  assert.throws(() => bulkTransactionPayload(pin), TransactionInputError);
});

test("compact transaction dates and signed amounts retain UTC dates and exact decimal strings", () => {
  assert.equal(transactionDateLabel("2024-03-01", "2024-03-01"), "Today");
  assert.equal(transactionDateLabel("2024-02-29", "2024-03-01"), "Yesterday");
  assert.equal(
    transactionDateLabel("2023-10-12", "2024-03-01"),
    "Oct 12, 2023",
  );
  assert.deepEqual(transactionDisplayAmount(input), {
    amount: input.amount,
    sign: "-",
    positive: false,
  });
  assert.deepEqual(
    transactionDisplayAmount({ type: "expense", amount: "-1E-18" }),
    { amount: "1E-18", sign: "+", positive: true },
  );
  assert.deepEqual(
    transactionDisplayAmount({ type: "income", amount: input.amount }),
    { amount: input.amount, sign: "+", positive: true },
  );
  assert.deepEqual(
    transactionDisplayAmount({ type: "transfer", amount: input.amount }),
    { amount: input.amount, sign: "", positive: false },
  );
});

test("bulk transport stays private and refuses partial-success response counts", async () => {
  const payload = { ids: [id], changes: { amount: input.amount } };
  await saveTransactions(
    {
      ...options,
      fetchImpl: async (url, request) => {
        assert.equal(url, `${options.baseUrl}/api/v1/transactions/bulk`);
        assert.equal(request.method, "PATCH");
        assert.equal(request.cache, "no-store");
        assert.equal(request.redirect, "error");
        assert.deepEqual(JSON.parse(request.body), payload);
        return Response.json({ count: 1 });
      },
    },
    payload,
  );
  await removeTransactions(
    {
      ...options,
      fetchImpl: async (_url, request) => {
        assert.equal(request.method, "DELETE");
        assert.deepEqual(JSON.parse(request.body), { ids: [id] });
        return Response.json({ count: 1 });
      },
    },
    [id],
  );
  await assert.rejects(
    saveTransactions(
      { ...options, fetchImpl: async () => Response.json({ count: 0 }) },
      payload,
    ),
    (error) => error instanceof BackendError && error.status === 502,
  );
  await assert.rejects(
    removeTransactions(
      {
        ...options,
        fetchImpl: async () =>
          Response.json({ detail: "Not found" }, { status: 404 }),
      },
      [id],
    ),
    (error) => error instanceof BackendError && error.status === 404,
  );
});

test("transaction payload keeps exact amounts and rejects inconsistent transfer and recurrence inputs", () => {
  const data = form({ description: "  Lunch  " });
  data.set("owner_subject", "forged");
  assert.deepEqual(transactionPayload(data), input);
  assert.equal(transactionPayload(form({ amount: "1e-100" })).amount, "1e-100");
  assert.deepEqual(
    transactionPayload(
      form({
        type: "transfer",
        destination_wallet_id: destination,
        recurrence: "monthly",
        recurrence_count: 3,
      }),
    ),
    {
      ...input,
      type: "transfer",
      destination_wallet_id: destination,
      recurrence: "monthly",
      recurrence_count: 3,
    },
  );
  for (const change of [
    { description: "x".repeat(501) },
    { amount: "-1", type: "income" },
    { amount: "-1", type: "transfer", destination_wallet_id: destination },
    { amount: "0" },
    { amount: "0e10" },
    { amount: "NaN" },
    { amount: "Infinity" },
    { date: "2026-02-30" },
    { date: "20260101" },
    { date: "0000-01-01" },
    { type: "transfer" },
    { type: "transfer", destination_wallet_id: id },
    { destination_wallet_id: destination },
    { category_id: "" },
    { subcategory_id: "../me" },
    { recurrence_count: "2" },
    { recurrence: "daily" },
    { recurrence: "weekly", recurrence_count: "0" },
    { recurrence: "weekly", recurrence_count: "10001" },
    { recurrence: "weekly", recurrence_count: "1.5" },
  ]) {
    assert.throws(
      () => transactionPayload(form(change)),
      TransactionInputError,
    );
  }
  assert.equal(validDate("2024-02-29"), true);
  assert.equal(validDate("9999-12-31"), true);
});

test("negative nonzero expenses preserve exact strings for creation and editing", async () => {
  for (const amount of ["-12.123456789012345678", "-1e-100"]) {
    const payload = transactionPayload(form({ amount }));
    assert.equal(payload.amount, amount);
    for (const transactionId of [null, id]) {
      const saved = await saveTransaction(
        {
          ...options,
          fetchImpl: async () => Response.json({ ...item, amount }),
        },
        transactionId,
        payload,
      );
      assert.equal(saved.amount, amount);
    }
  }
  for (const amount of ["-0", "-0.00", "-0e5"])
    assert.throws(
      () => transactionPayload(form({ amount })),
      TransactionInputError,
    );
});

test("transaction forms and responses preserve optional descriptions as empty strings", async () => {
  for (const description of ["", "   "]) {
    assert.equal(transactionPayload(form({ description })).description, "");
  }
  const omitted = form();
  omitted.delete("description");
  const payload = transactionPayload(omitted);
  assert.equal(payload.description, "");
  const saved = await saveTransaction(
    {
      ...options,
      fetchImpl: async () => Response.json({ ...item, description: "" }),
    },
    null,
    payload,
  );
  assert.equal(saved.description, "");
});

test("transaction URL filters preserve pagination and refuse invalid dates and identifiers", () => {
  const filters = transactionFilters({
    page: "2",
    q: "food & drink",
    wallet_id: id,
  });
  const query = new URLSearchParams(transactionQuery(filters, 3));
  assert.equal(query.get("q"), "food & drink");
  assert.equal(query.get("page"), "3");
  assert.equal(query.get("wallet_id"), id);
  assert.equal(transactionFilters().page, 1);
  for (const params of [
    { page: "0" },
    { page: "2147483648" },
    { page: ["1", "2"] },
    { q: ["first", "second"] },
    { wallet_id: "../me" },
    { type: "other" },
    { date_from: "2026-02-30" },
    { date_from: "2026-02-01", date_to: "2026-01-01" },
  ])
    assert.throws(() => transactionFilters(params), TransactionInputError);
  assert.throws(() => transactionId("../me"), TransactionInputError);
});

test("monthly views use UTC calendar bounds and reject malformed or ambiguous periods", () => {
  const today = "2026-11-03";
  assert.deepEqual(transactionView({}, today), {
    month: "2026-11",
    filters: { page: 1, date_from: "2026-11-01", date_to: "2026-11-30" },
  });
  for (const [month, last] of [
    ["2024-02", "2024-02-29"],
    ["2026-02", "2026-02-28"],
    ["0001-01", "0001-01-31"],
    ["9999-12", "9999-12-31"],
  ]) {
    assert.equal(transactionView({ month }, today).filters.date_to, last);
  }
  assert.equal(shiftTransactionMonth("2026-12", 1), "2027-01");
  assert.equal(shiftTransactionMonth("2026-01", -1), "2025-12");
  assert.equal(shiftTransactionMonth("0001-01", -1), null);
  assert.equal(shiftTransactionMonth("9999-12", 1), null);
  assert.equal(transactionMonthLabel("2027-02"), "February 2027");
  for (const params of [
    { month: "2026-13" },
    { month: "0000-01" },
    { month: "2026-2" },
    { month: ["2026-01", "2026-02"] },
    { month: "2026-01", date_from: "2026-01-01" },
  ]) {
    assert.throws(() => transactionView(params, today), TransactionInputError);
  }
});

test("month navigation and pagination preserve filters while keeping view parameters out of API requests", () => {
  const { filters, month } = transactionView(
    {
      month: "2026-04",
      page: "2",
      q: "food & drink",
      wallet_id: id,
    },
    "2026-11-03",
  );
  const apiQuery = new URLSearchParams(transactionQuery(filters));
  assert.equal(apiQuery.has("month"), false);
  assert.equal(apiQuery.get("date_from"), "2026-04-01");
  assert.equal(apiQuery.get("date_to"), "2026-04-30");
  const viewQuery = new URLSearchParams(
    transactionViewQuery(filters, month, 3),
  );
  assert.equal(viewQuery.get("month"), "2026-04");
  assert.equal(viewQuery.get("q"), "food & drink");
  assert.equal(viewQuery.get("page"), "3");
  assert.equal(viewQuery.has("date_from"), false);
  const next = new URLSearchParams(transactionPeriodQuery(filters, "2026-05"));
  assert.equal(next.get("month"), "2026-05");
  assert.equal(next.get("wallet_id"), id);
  assert.equal(next.get("q"), "food & drink");
  assert.equal(next.get("page"), "1");
  const custom = transactionView(
    { date_from: "2026-01-03", date_to: "2026-04-05" },
    "2026-11-03",
  );
  assert.equal(custom.month, "all");
  assert.equal(
    new URLSearchParams(transactionViewQuery(custom.filters, custom.month)).get(
      "date_from",
    ),
    "2026-01-03",
  );
  assert.equal(
    new URLSearchParams(transactionPeriodQuery(custom.filters, "all")).has(
      "date_from",
    ),
    false,
  );
  assert.deepEqual(transactionView({ month: "all" }, "2026-11-03").filters, {
    page: 1,
  });
});

test("transaction requests keep tokens server-side, validate results, and preserve decimal strings", async () => {
  for (const target of [null, id]) {
    assert.deepEqual(
      await saveTransaction(
        {
          ...options,
          fetchImpl: async (url, request) => {
            assert.equal(
              url,
              `${options.baseUrl}/api/v1/transactions${target ? `/${id}` : ""}`,
            );
            assert.equal(request.method, target ? "PUT" : "POST");
            assert.equal(
              request.headers.Authorization,
              `Bearer ${options.token}`,
            );
            assert.equal(request.cache, "no-store");
            assert.equal(request.redirect, "error");
            assert.equal(JSON.parse(request.body).amount, input.amount);
            return Response.json({ ...item, owner_subject: "discard" });
          },
        },
        target,
        input,
      ),
      item,
    );
  }
  const result = await fetchTransactions(
    {
      ...options,
      fetchImpl: async (url) => {
        assert.equal(new URL(url).searchParams.get("q"), "Lunch");
        return Response.json({
          transactions: [occurrence],
          page: 1,
          page_size: 10,
          total: 1,
          as_of: "2026-01-31",
          summary,
        });
      },
    },
    { page: 1, q: "Lunch" },
  );
  assert.deepEqual(result.transactions, [occurrence]);
  assert.deepEqual(result.summary, summary);
  assert.deepEqual(
    await fetchTransactionOptions({
      ...options,
      fetchImpl: async () =>
        Response.json({
          wallets: [
            {
              id,
              name: "Everyday",
              currency: "EUR",
              colour: "#123abc",
              icon: "wallet",
              icon_image_url: null,
              owner_subject: "discard",
            },
          ],
        }),
    }),
    [
      {
        id,
        name: "Everyday",
        currency: "EUR",
        colour: "#123abc",
        icon: "wallet",
        icon_image_url: null,
      },
    ],
  );
  await removeTransaction(
    {
      ...options,
      fetchImpl: async (url, request) => {
        assert.equal(request.method, "DELETE");
        assert.equal(url, `${options.baseUrl}/api/v1/transactions/${id}`);
        return new Response(null, { status: 204 });
      },
    },
    id,
  );
});

test("independent year navigation preserves the selected month and rejects invalid years", () => {
  assert.equal(transactionYearMonth("2026-11", "2024"), "2024-11");
  assert.equal(transactionYearMonth("2026-11", "1"), "0001-11");
  assert.equal(transactionYearMonth("2026-11", "9999"), "9999-11");
  for (const year of [
    "0",
    "0000",
    "10000",
    "-1",
    "1.5",
    "",
    null,
    ["2026"],
    "2026<script>",
  ]) {
    assert.throws(
      () => transactionYearMonth("2026-11", year),
      TransactionInputError,
    );
  }
});

test("transaction summaries retain exact signed totals and reject malformed or mixed response fields", async () => {
  const listing = {
    transactions: [occurrence],
    page: 1,
    page_size: 10,
    total: 1,
    as_of: "2026-01-31",
    summary,
  };
  const signed = {
    ...listing,
    transactions: [{ ...occurrence, amount: "-12.123456789012345678" }],
    summary: {
      currencies: [
        {
          currency: "EUR",
          income: "0",
          expense: "-12.123456789012345678",
          transfer: "0",
          net: "12.123456789012345678",
        },
      ],
      wallet_expenses: [
        { ...summary.wallet_expenses[0], amount: "-12.123456789012345678" },
      ],
    },
  };
  assert.deepEqual(
    (
      await fetchTransactions(
        { ...options, fetchImpl: async () => Response.json(signed) },
        { page: 1 },
      )
    ).summary,
    signed.summary,
  );
  for (const invalid of [
    undefined,
    { currencies: [], wallet_expenses: [] },
    { ...summary, currencies: [{ ...summary.currencies[0], income: 0.1 }] },
    { ...summary, currencies: [{ ...summary.currencies[0], income: "-1" }] },
    { ...summary, currencies: [{ ...summary.currencies[0], transfer: "-1" }] },
    { ...summary, currencies: [{ ...summary.currencies[0], net: "NaN" }] },
    { ...summary, currencies: [{ ...summary.currencies[0], currency: "XYZ" }] },
    { ...summary, currencies: [summary.currencies[0], summary.currencies[0]] },
    {
      ...summary,
      wallet_expenses: [{ ...summary.wallet_expenses[0], amount: -1 }],
    },
    {
      ...summary,
      wallet_expenses: [{ ...summary.wallet_expenses[0], currency: "USD" }],
    },
  ]) {
    await assert.rejects(
      fetchTransactions(
        {
          ...options,
          fetchImpl: async () =>
            Response.json({ ...listing, summary: invalid }),
        },
        { page: 1 },
      ),
      (error) => error instanceof BackendError && error.status === 502,
    );
  }
  await assert.rejects(
    fetchTransactions(
      {
        ...options,
        fetchImpl: async () =>
          Response.json({
            ...listing,
            transactions: [{ ...occurrence, currency: null }],
          }),
      },
      { page: 1 },
    ),
    (error) => error instanceof BackendError && error.status === 502,
  );
  const empty = {
    transactions: [],
    page: 1,
    page_size: 10,
    total: 0,
    as_of: listing.as_of,
    summary: { currencies: [], wallet_expenses: [] },
  };
  assert.deepEqual(
    await fetchTransactions(
      { ...options, fetchImpl: async () => Response.json(empty) },
      { page: 1 },
    ),
    empty,
  );
});

test("transaction HTTP refusals and malformed financial responses are explicit", async () => {
  for (const status of [401, 404, 422, 503]) {
    await assert.rejects(
      saveTransaction(
        {
          ...options,
          fetchImpl: async () => new Response(null, { status }),
        },
        id,
        input,
      ),
      (error) => error instanceof BackendError && error.status === status,
    );
  }
  for (const change of [
    { amount: 12.5 },
    { amount: "NaN" },
    { amount: "0" },
    { recurrence: "daily" },
    { id: "../me" },
    { type: "transfer", destination_wallet_id: null },
    { created_at: "invalid" },
    { is_pinned: undefined },
    { is_pinned: null },
    { is_pinned: "true" },
  ]) {
    await assert.rejects(
      saveTransaction(
        {
          ...options,
          fetchImpl: async () => Response.json({ ...item, ...change }),
        },
        null,
        input,
      ),
      (error) => error instanceof BackendError && error.status === 502,
    );
  }
  for (const data of [
    {},
    { transactions: [], page: 1, page_size: 10, total: 1, as_of: "2026-01-31" },
    {
      transactions: [{ ...occurrence, occurrence_date: "2026-02-30" }],
      page: 1,
      page_size: 10,
      total: 1,
      as_of: "2026-01-31",
    },
  ]) {
    await assert.rejects(
      fetchTransactions(
        {
          ...options,
          fetchImpl: async () => Response.json(data),
        },
        { page: 1 },
      ),
      (error) => error instanceof BackendError && error.status === 502,
    );
  }
  await assert.rejects(
    fetchTransactionOptions({
      ...options,
      fetchImpl: async () =>
        Response.json({ wallets: [{ id: "invalid", name: "Wallet" }] }),
    }),
    (error) => error instanceof BackendError && error.status === 502,
  );
});
