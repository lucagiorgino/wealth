import assert from "node:assert/strict";
import test from "node:test";
import {
  CSVImportError,
  csvFile,
  importPayload,
  mappedValue,
} from "../lib/transaction-imports.js";
import {
  BackendError,
  uploadTransactionCSV,
  validateTransactionImport,
  confirmTransactionImport,
} from "../lib/api-client.js";
import { mockImportReport } from "./transaction-import-fixtures.js";

const id = "00582a98-a07f-4fdd-8458-54b590b29cd6";
const transaction = {
  description: "CSV",
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
const document = {
  headers: ["memo"],
  rows: [{ number: 2, values: ["CSV"], included: true, overrides: {} }],
  mapping: { description: 0 },
};
const request = {
  ...document,
  import_id: id,
  defaults: {},
  date_order: "auto",
  decimal_separator: "auto",
  approved_creations: [],
};
const report = {
  rows: [
    {
      number: 2,
      included: true,
      errors: {},
      transaction,
      normalized: { amount: transaction.amount, date: transaction.date },
      currency: null,
    },
  ],
  selected: 1,
  invalid: 0,
  creations: [],
  creations_approved: true,
};
const options = {
  baseUrl: "https://api.example.test",
  token: "server-only-test-token",
};

test("CSV files and edited mapping payloads are bounded, closed, and preserve strings", () => {
  const form = new FormData();
  form.set("file", new File(["memo\nCSV"], "data.csv", { type: "text/csv" }));
  assert.equal(csvFile(form).delimiter, "auto");
  form.set("file", new File(["x".repeat(512 * 1024 + 1)], "large.csv"));
  assert.throws(() => csvFile(form), CSVImportError);
  assert.deepEqual(
    importPayload({ ...request, owner_subject: "forged" }),
    request,
  );
  for (const changes of [
    { mapping: { description: 0, amount: 0 } },
    { mapping: { description: 3 } },
    { approved_creations: ["not-an-id"] },
    { date_order: "guess" },
    { decimal_separator: "other" },
    { rows: [{ ...document.rows[0], number: 3 }] },
    { rows: [{ ...document.rows[0], overrides: { owner_subject: "forged" } }] },
  ])
    assert.throws(
      () => importPayload({ ...request, ...changes }),
      CSVImportError,
    );
  const edited = {
    ...request,
    defaults: { amount: transaction.amount },
    rows: [{ ...document.rows[0], overrides: { recurrence: "" } }],
  };
  assert.equal(
    mappedValue(edited, edited.rows[0], "amount"),
    transaction.amount,
  );
  assert.equal(mappedValue(edited, edited.rows[0], "recurrence"), "");
});

test("CSV upload uses private bounded binary transport and validates automatic mapping", async () => {
  const file = new File(["memo\nCSV"], "data.csv");
  let call;
  const result = await uploadTransactionCSV(
    {
      ...options,
      fetchImpl: async (url, init) => {
        call = { url, init };
        return Response.json(document);
      },
    },
    file,
    ";",
  );
  assert.deepEqual(result, document);
  assert.ok(call.url.endsWith("delimiter=%3B"));
  assert.equal(call.init.body, file);
  assert.equal(call.init.headers["Content-Type"], "text/csv");
  assert.equal(call.init.cache, "no-store");
  assert.equal(call.init.redirect, "error");
  assert.ok(!call.url.includes(options.token));
  await assert.rejects(
    uploadTransactionCSV(
      {
        ...options,
        fetchImpl: async () =>
          Response.json({ ...document, mapping: { amount: 3 } }),
      },
      file,
      "auto",
    ),
    (error) => error.status === 502,
  );
});

test("CSV validation preserves row errors and refuses malformed financial reports", async () => {
  const result = await validateTransactionImport(
    { ...options, fetchImpl: async () => Response.json(report) },
    request,
  );
  assert.equal(result.rows[0].transaction.amount, transaction.amount);
  for (const bad of [
    { ...report, selected: 0 },
    { ...report, rows: [{ ...report.rows[0], included: false }] },
    {
      ...report,
      rows: [
        { ...report.rows[0], transaction: { ...transaction, amount: 1.2 } },
      ],
    },
  ]) {
    await assert.rejects(
      validateTransactionImport(
        { ...options, fetchImpl: async () => Response.json(bad) },
        request,
      ),
      (error) => error.status === 502,
    );
  }
});

test("CSV negative expenses remain exact and same-named proposals are isolated by family", async () => {
  const document = {
    headers: ["amount", "type", "category"],
    mapping: { amount: 0, type: 1, category_id: 2 },
    rows: [
      ["-12.123456789012345678", "expense", "Other"],
      ["12", "income", "Other"],
    ].map((values, index) => ({
      number: index + 2,
      values,
      included: true,
      overrides: {},
    })),
    defaults: { date: "2026-01-31", source_wallet_id: id },
    approved_creations: [],
  };
  const state = {
    wallets: [{ id, name: "Wallet" }],
    categories: [],
    planIds: new Map(),
  };
  const first = mockImportReport(document, state);
  assert.equal(first.invalid, 0);
  assert.equal(first.rows[0].transaction.amount, "-12.123456789012345678");
  assert.deepEqual(
    first.creations.map((item) => item.category_kind),
    ["expense", "income"],
  );
  assert.notEqual(first.creations[0].id, first.creations[1].id);
  assert.deepEqual(
    mockImportReport(document, state).creations,
    first.creations,
  );
  const validated = await validateTransactionImport(
    { ...options, fetchImpl: async () => Response.json(first) },
    { ...request, ...document },
  );
  assert.equal(validated.rows[0].transaction.amount, "-12.123456789012345678");
  for (const [type, kind] of [
    ["income", "expense"],
    ["expense", "income"],
  ]) {
    const wrongFamily = mockImportReport(
      {
        ...document,
        rows: [
          {
            number: 2,
            values: ["12", type, id],
            included: true,
            overrides: {},
          },
        ],
      },
      {
        ...state,
        categories: [
          { id, name: "Other", kind, preset_key: null, subcategories: [] },
        ],
      },
    );
    assert.equal(wrongFamily.invalid, 1);
    assert.equal(wrongFamily.creations.length, 0);
    assert.ok(wrongFamily.rows[0].errors.category_id);
  }
});

test("CSV preset-match metadata is accepted only for main-category proposals", async () => {
  const creation = {
    id,
    kind: "category",
    category_kind: "expense",
    name: "Casa",
    category_id: null,
    parent_name: null,
    colour: "#3b82f6",
    icon: "house",
    preset_key: "casa",
  };
  const recap = { ...report, creations: [creation], creations_approved: false };
  const result = await validateTransactionImport(
    { ...options, fetchImpl: async () => Response.json(recap) },
    request,
  );
  assert.equal(result.creations[0].preset_key, "casa");
  for (const changes of [
    { category_kind: null },
    { category_kind: "transfer" },
    { kind: "wallet", icon: "wallet" },
    { preset_key: "../../other" },
    { preset_key: 3 },
  ]) {
    await assert.rejects(
      validateTransactionImport(
        {
          ...options,
          fetchImpl: async () =>
            Response.json({
              ...recap,
              creations: [{ ...creation, ...changes }],
            }),
        },
        request,
      ),
      (error) => error instanceof BackendError && error.status === 502,
    );
  }
});

test("CSV approval and format settings are forwarded and an unapproved creation recap is validated", async () => {
  const creation = {
    id,
    kind: "wallet",
    category_kind: null,
    name: "New wallet",
    category_id: null,
    parent_name: null,
    colour: "#21634b",
    icon: "wallet",
  };
  const recap = { ...report, creations: [creation], creations_approved: false };
  let payload;
  await validateTransactionImport(
    {
      ...options,
      fetchImpl: async (url, init) => {
        payload = JSON.parse(init.body);
        return Response.json(recap);
      },
    },
    { ...request, date_order: "day-first", decimal_separator: "comma" },
  );
  assert.equal(payload.date_order, "day-first");
  assert.equal(payload.decimal_separator, "comma");
  await validateTransactionImport(
    {
      ...options,
      fetchImpl: async () =>
        Response.json({ ...recap, creations_approved: true }),
    },
    { ...request, approved_creations: [id] },
  );
  await assert.rejects(
    validateTransactionImport(
      {
        ...options,
        fetchImpl: async () =>
          Response.json({ ...recap, creations_approved: true }),
      },
      request,
    ),
    (error) => error.status === 502,
  );
  await assert.rejects(
    validateTransactionImport(
      {
        ...options,
        fetchImpl: async () =>
          Response.json({
            ...recap,
            creations: [{ ...creation, kind: "subcategory" }],
          }),
      },
      request,
    ),
    (error) => error.status === 502,
  );
});

test("CSV confirmation submits once as an atomic batch and retains validated refusal rows", async () => {
  const invalid = {
    selected: 1,
    invalid: 1,
    creations: [],
    creations_approved: true,
    rows: [
      {
        number: 2,
        included: true,
        errors: { amount: "Required" },
        transaction: null,
        normalized: {},
        currency: null,
      },
    ],
  };
  await assert.rejects(
    confirmTransactionImport(
      {
        ...options,
        fetchImpl: async () =>
          Response.json(
            { detail: "Fix rows", validation: invalid },
            { status: 422 },
          ),
      },
      request,
    ),
    (error) =>
      error instanceof BackendError &&
      error.status === 422 &&
      error.validation.invalid === 1,
  );
  let calls = 0;
  await confirmTransactionImport(
    {
      ...options,
      fetchImpl: async (url, init) => {
        calls++;
        assert.equal(JSON.parse(init.body).import_id, id);
        assert.ok(url.endsWith("/import/confirm"));
        return Response.json({ imported: 1 }, { status: 201 });
      },
    },
    request,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    confirmTransactionImport(
      { ...options, fetchImpl: async () => Response.json({ imported: 0 }) },
      request,
    ),
    (error) => error.status === 502,
  );
  await assert.rejects(
    confirmTransactionImport(
      { ...options, fetchImpl: async () => Response.json({}, { status: 503 }) },
      request,
    ),
    (error) => error.status === 503,
  );
});
