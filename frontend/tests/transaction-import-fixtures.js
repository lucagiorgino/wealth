import { randomUUID } from "node:crypto";
import { mappedValue } from "../lib/transaction-imports.js";
import {
  validDate,
  validTransaction,
  validTransactionId,
} from "../lib/transactions.js";
import { decimalAmount } from "../lib/wallets.js";
import { categoryPresets } from "./category-fixtures.js";

export const csvTestToken = "csv-import-browser-test-token";
export const enhancedCSVTestToken = "enhanced-csv-browser-test-token";
export const importCSV =
  "Bank note,amount,date,type,wallet,category\nCSV groceries,12.123456789012345678,2026-01-31,expense,CSV wallet,CSV category\nCSV missing amount,,2026-01-31,expense,CSV wallet,CSV category\nCSV excluded,999.99,2026-01-31,expense,CSV wallet,CSV category\n";
export const importDocument = {
  headers: ["Bank note", "amount", "date", "type", "wallet", "category"],
  mapping: {
    description: null,
    amount: 1,
    date: 2,
    type: 3,
    source_wallet_id: 4,
    category_id: 5,
  },
  rows: [
    [
      "CSV groceries",
      "12.123456789012345678",
      "2026-01-31",
      "expense",
      "CSV wallet",
      "CSV category",
    ],
    [
      "CSV missing amount",
      "",
      "2026-01-31",
      "expense",
      "CSV wallet",
      "CSV category",
    ],
    [
      "CSV excluded",
      "999.99",
      "2026-01-31",
      "expense",
      "CSV wallet",
      "CSV category",
    ],
  ].map((values, index) => ({
    number: index + 2,
    values,
    included: true,
    overrides: {},
  })),
};

export const enhancedCSV =
  "memo;amount;date;type;wallet;category;subcategory\nNormalized;-€ 1.234,56;31/01/2026;expense;New CSV wallet;Casa;New child\nSecond;12,50 EUR;03/04/2026;income;New CSV wallet;Casa;New child\nInvalid currency;XYZ 12;31/01/2026;expense;Unused CSV wallet;Unused CSV category;\n";
export const enhancedDocument = {
  headers: [
    "memo",
    "amount",
    "date",
    "type",
    "wallet",
    "category",
    "subcategory",
  ],
  mapping: {
    description: 0,
    amount: 1,
    date: 2,
    type: 3,
    source_wallet_id: 4,
    category_id: 5,
    subcategory_id: 6,
  },
  rows: [
    [
      "Normalized",
      "-€ 1.234,56",
      "31/01/2026",
      "expense",
      "New CSV wallet",
      "Casa",
      "New child",
    ],
    [
      "Second",
      "12,50 EUR",
      "03/04/2026",
      "income",
      "New CSV wallet",
      "Casa",
      "New child",
    ],
    [
      "Invalid currency",
      "XYZ 12",
      "31/01/2026",
      "expense",
      "Unused CSV wallet",
      "Unused CSV category",
      "",
    ],
  ].map((values, index) => ({
    number: index + 2,
    values,
    included: true,
    overrides: {},
  })),
};

export function mockImportReport(data, state) {
  const wallets = [...state.wallets];
  const categories = state.categories.map((category) => ({
    ...category,
    subcategories: [...category.subcategories],
  }));
  const creations = [];
  const fields = [
    "description",
    "amount",
    "date",
    "type",
    "source_wallet_id",
    "destination_wallet_id",
    "category_id",
    "subcategory_id",
    "recurrence",
  ];
  const values = data.rows.map((row) =>
    Object.fromEntries(
      fields.map((field) => [field, mappedValue(data, row, field) || null]),
    ),
  );
  const presetFor = (value, categoryKind) =>
    categoryPresets.find(
      (preset) =>
        (!categoryKind || preset.kind === categoryKind) &&
        [preset.name.toLowerCase(), preset.key].includes(value?.toLowerCase()),
    );
  function find(choices, value, categoryKind) {
    if (categoryKind)
      choices = choices.filter((item) => item.kind === categoryKind);
    return (
      choices.find((item) => item.id === value || item.name === value) ??
      choices.find(
        (item) =>
          item.preset_key &&
          item.preset_key === presetFor(value, categoryKind)?.key,
      )
    );
  }
  function propose(kind, name, choices, parent, categoryKind) {
    if (!name || validTransactionId(name) || find(choices, name, categoryKind))
      return;
    const preset = kind === "category" ? presetFor(name, categoryKind) : null;
    const key = `${kind}:${categoryKind ?? ""}:${parent?.id ?? ""}:${preset?.name ?? name}`;
    if (!state.planIds.has(key)) state.planIds.set(key, randomUUID());
    const item = {
      id: state.planIds.get(key),
      kind,
      category_kind: kind === "category" ? categoryKind : null,
      name: preset?.name ?? name,
      category_id: parent?.id ?? null,
      parent_name: parent?.name ?? null,
      colour: parent?.colour ?? preset?.colour ?? "#21634b",
      icon:
        parent?.icon ??
        preset?.icon ??
        (kind === "wallet" ? "wallet" : "circle-ellipsis"),
      preset_key: preset?.key ?? null,
    };
    creations.push(item);
    choices.push(
      kind === "category"
        ? { ...item, kind: categoryKind, subcategories: [] }
        : item,
    );
  }
  values.forEach((value, index) => {
    if (!data.rows[index].included) return;
    propose("wallet", value.source_wallet_id, wallets);
    propose(
      "category",
      value.category_id,
      categories,
      null,
      value.type === "income" ? "income" : "expense",
    );
  });
  values.forEach((value, index) => {
    const parent = find(
      categories,
      value.category_id,
      value.type === "income" ? "income" : "expense",
    );
    if (data.rows[index].included && parent)
      propose(
        "subcategory",
        value.subcategory_id,
        parent.subcategories,
        parent,
      );
  });
  const rows = values.map((value, index) => {
    const row = data.rows[index];
    const normalized = {};
    let currency = null;
    const errors = {};
    const knownAmounts = {
      "€ 1.234,56": ["1234.56", "€"],
      "-€ 1.234,56": ["-1234.56", "€"],
      "12,50 EUR": ["12.50", "EUR"],
    };
    if (knownAmounts[value.amount]) {
      [value.amount, currency] = knownAmounts[value.amount];
    }
    if (value.amount && decimalAmount.test(value.amount))
      normalized.amount = value.amount;
    else
      errors.amount =
        "A positive exact amount with a valid currency is required.";
    if (value.date === "31/01/2026") value.date = "2026-01-31";
    if (value.date === "03/04/2026")
      value.date =
        data.date_order === "month-first" ? "2026-03-04" : "2026-04-03";
    if (validDate(value.date)) normalized.date = value.date;
    else errors.date = "Check the CSV date order.";
    const parent = find(
      categories,
      value.category_id,
      value.type === "income" ? "income" : "expense",
    );
    if (!parent)
      errors.category_id = "Choose a category in the transaction's family.";
    value.source_wallet_id = find(wallets, value.source_wallet_id)?.id ?? null;
    value.destination_wallet_id =
      find(wallets, value.destination_wallet_id)?.id ?? null;
    value.category_id = parent?.id ?? null;
    value.subcategory_id =
      find(parent?.subcategories ?? [], value.subcategory_id)?.id ?? null;
    value.recurrence_count = mappedValue(data, row, "recurrence_count")
      ? Number(mappedValue(data, row, "recurrence_count"))
      : null;
    value.description ??= "";
    if (!Object.keys(errors).length && !validTransaction(value))
      errors._row = "Check transaction fields.";
    return {
      number: row.number,
      included: row.included,
      errors,
      transaction: Object.keys(errors).length ? null : value,
      normalized,
      currency,
    };
  });
  return {
    rows,
    selected: rows.filter((row) => row.included).length,
    invalid: rows.filter(
      (row) => row.included && Object.keys(row.errors).length,
    ).length,
    creations,
    creations_approved: creations.every((item) =>
      data.approved_creations.includes(item.id),
    ),
  };
}
