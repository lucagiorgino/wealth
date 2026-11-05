import {
  validDate,
  validTransaction,
  validTransactionId,
} from "./transactions.js";
import { categoryIcons } from "./categories.js";
import { decimalAmount } from "./wallets.js";

export const maxCSVBytes = 512 * 1024;
export const importFields = [
  ["description", "Description", false],
  ["amount", "Amount", true],
  ["date", "Date", true],
  ["type", "Type", true],
  ["source_wallet_id", "Source wallet", true],
  ["destination_wallet_id", "Destination wallet", false],
  ["category_id", "Main category", true],
  ["subcategory_id", "Subcategory", false],
  ["recurrence", "Recurrence", false],
  ["recurrence_count", "Recurrence count", false],
];
const fields = importFields.map(([field]) => field);
export class CSVImportError extends Error {}

function cells(values) {
  return (
    Array.isArray(values) &&
    values.length <= 32 &&
    values.every(
      (value) => typeof value === "string" && [...value].length <= 1000,
    )
  );
}

function fieldValues(values) {
  return (
    values &&
    typeof values === "object" &&
    !Array.isArray(values) &&
    Object.entries(values).every(
      ([field, value]) =>
        fields.includes(field) &&
        typeof value === "string" &&
        [...value].length <= 1000,
    )
  );
}

export function validImportDocument(data) {
  if (
    !data ||
    !cells(data.headers) ||
    !data.headers.length ||
    !Array.isArray(data.rows) ||
    !data.rows.length ||
    data.rows.length > 500 ||
    !data.mapping ||
    typeof data.mapping !== "object" ||
    Array.isArray(data.mapping)
  )
    return false;
  const columns = Object.values(data.mapping).filter((value) => value !== null);
  return (
    Object.entries(data.mapping).every(
      ([field, value]) =>
        fields.includes(field) &&
        (value === null ||
          (Number.isInteger(value) &&
            value >= 0 &&
            value < data.headers.length)),
    ) &&
    new Set(columns).size === columns.length &&
    data.rows.every(
      (row, index) =>
        row?.number === index + 2 &&
        cells(row.values) &&
        typeof row.included === "boolean" &&
        fieldValues(row.overrides),
    )
  );
}

export function importPayload(data) {
  const approved = data.approved_creations ?? [];
  const dateOrder = data.date_order ?? "auto";
  const separator = data.decimal_separator ?? "auto";
  if (
    !validImportDocument(data) ||
    !validTransactionId(data.import_id) ||
    !fieldValues(data.defaults) ||
    !["auto", "day-first", "month-first", "year-first"].includes(dateOrder) ||
    !["auto", "dot", "comma"].includes(separator) ||
    !Array.isArray(approved) ||
    approved.length > 2000 ||
    !approved.every(validTransactionId)
  ) {
    throw new CSVImportError(
      "Check the CSV rows, field mapping, and import key.",
    );
  }
  const payload = {
    headers: data.headers,
    rows: data.rows.map(({ number, values, included, overrides }) => ({
      number,
      values,
      included,
      overrides,
    })),
    mapping: data.mapping,
    defaults: data.defaults,
    import_id: data.import_id,
    date_order: dateOrder,
    decimal_separator: separator,
    approved_creations: approved.map((value) => value.toLowerCase()),
  };
  if (
    new TextEncoder().encode(JSON.stringify(payload)).length >
    2 * 1024 * 1024
  ) {
    throw new CSVImportError(
      "The mapped import exceeds 2 MiB. Use a smaller CSV file.",
    );
  }
  return payload;
}

export function validImportValidation(report, request) {
  if (
    !report ||
    !Array.isArray(report.rows) ||
    report.rows.length !== request.rows.length ||
    !Array.isArray(report.creations) ||
    report.creations.length > 2000 ||
    typeof report.creations_approved !== "boolean" ||
    new Set(report.creations.map((item) => item?.id)).size !==
      report.creations.length ||
    !report.creations.every(
      (item) =>
        validTransactionId(item?.id) &&
        ["wallet", "category", "subcategory"].includes(item.kind) &&
        (item.kind === "category"
          ? ["expense", "income"].includes(item.category_kind)
          : item.category_kind === null) &&
        typeof item.name === "string" &&
        item.name.trim() &&
        [...item.name].length <= 100 &&
        /^#[0-9a-f]{6}$/i.test(item.colour) &&
        (item.preset_key == null ||
          (item.kind === "category" &&
            typeof item.preset_key === "string" &&
            item.preset_key.length <= 32 &&
            /^[a-z][a-z-]*$/.test(item.preset_key))) &&
        (item.kind === "wallet"
          ? item.icon === "wallet"
          : categoryIcons.some((icon) => icon.value === item.icon)) &&
        (item.kind === "subcategory"
          ? validTransactionId(item.category_id) &&
            typeof item.parent_name === "string" &&
            item.parent_name.trim()
          : item.category_id === null && item.parent_name === null),
    ) ||
    report.creations_approved !==
      report.creations.every((item) =>
        (request.approved_creations ?? []).includes(item.id),
      )
  )
    return false;
  return (
    report.rows.every(
      (row, index) =>
        row?.number === request.rows[index].number &&
        row.included === request.rows[index].included &&
        row.errors &&
        typeof row.errors === "object" &&
        !Array.isArray(row.errors) &&
        row.normalized &&
        typeof row.normalized === "object" &&
        !Array.isArray(row.normalized) &&
        Object.entries(row.normalized).every(
          ([field, value]) =>
            ["amount", "date"].includes(field) &&
            typeof value === "string" &&
            value.length <= 1000 &&
            (field === "amount" ? decimalAmount.test(value) : validDate(value)),
        ) &&
        (row.currency === null ||
          (typeof row.currency === "string" && row.currency.length <= 4)) &&
        Object.entries(row.errors).every(
          ([field, message]) =>
            (fields.includes(field) || field === "_row") &&
            typeof message === "string" &&
            message.length > 0 &&
            message.length <= 500,
        ) &&
        (Object.keys(row.errors).length
          ? row.transaction === null
          : validTransaction(row.transaction)),
    ) &&
    report.selected === report.rows.filter((row) => row.included).length &&
    report.invalid ===
      report.rows.filter(
        (row) => row.included && Object.keys(row.errors).length,
      ).length
  );
}

export function csvFile(formData) {
  const file = formData.get("file");
  if (
    !file ||
    typeof file === "string" ||
    !file.name.toLowerCase().endsWith(".csv") ||
    !file.size ||
    file.size > maxCSVBytes
  ) {
    throw new CSVImportError("Choose a nonempty .csv file up to 512 KiB.");
  }
  const delimiter = formData.get("delimiter") ?? "auto";
  if (!["auto", ",", ";", "\t"].includes(delimiter)) {
    throw new CSVImportError("Choose a supported CSV delimiter.");
  }
  return { file, delimiter };
}

export function mappedValue(data, row, field) {
  const column = data.mapping[field];
  return (
    row.overrides[field] ??
    ((column === null || column === undefined
      ? ""
      : row.values[column]?.trim()) ||
      data.defaults[field] ||
      "")
  );
}
