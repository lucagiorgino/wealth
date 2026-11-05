import { decimalAmount } from "./wallets.js";

export class TransactionInputError extends Error {}

export const transactionTypes = ["income", "expense", "transfer"];
export const recurrenceFrequencies = ["weekly", "monthly", "annually"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validTransactionId(value) {
  return typeof value === "string" && uuid.test(value);
}

export function transactionId(value) {
  if (!validTransactionId(value)) {
    throw new TransactionInputError("Choose a valid transaction or reference.");
  }
  return value;
}

export function validDate(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "0001-01-01"
  )
    return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function validTransaction(data) {
  return (
    data &&
    typeof data.description === "string" &&
    [...data.description.trim()].length <= 500 &&
    typeof data.amount === "string" &&
    decimalAmount.test(data.amount) &&
    (data.type === "expense" || !data.amount.startsWith("-")) &&
    /[1-9]/.test(data.amount.split(/[eE]/)[0]) &&
    validDate(data.date) &&
    transactionTypes.includes(data.type) &&
    validTransactionId(data.source_wallet_id) &&
    validTransactionId(data.category_id) &&
    (data.subcategory_id === null || validTransactionId(data.subcategory_id)) &&
    (data.type === "transfer"
      ? validTransactionId(data.destination_wallet_id) &&
        data.destination_wallet_id !== data.source_wallet_id
      : data.destination_wallet_id === null) &&
    (data.recurrence === null
      ? data.recurrence_count === null
      : recurrenceFrequencies.includes(data.recurrence) &&
        (data.recurrence_count === null ||
          (Number.isInteger(data.recurrence_count) &&
            data.recurrence_count >= 1 &&
            data.recurrence_count <= 10000)))
  );
}

export function transactionPayload(form) {
  const data = Object.fromEntries(
    [
      "description",
      "amount",
      "date",
      "type",
      "source_wallet_id",
      "destination_wallet_id",
      "category_id",
      "subcategory_id",
      "recurrence",
    ].map((key) => {
      const value = form.get(key);
      if (value !== null && typeof value !== "string") {
        throw new TransactionInputError("Check the transaction fields.");
      }
      return [key, value?.trim() || null];
    }),
  );
  data.description ??= "";
  const count = form.get("recurrence_count");
  if (
    count !== null &&
    (typeof count !== "string" || (count !== "" && !/^[1-9]\d*$/.test(count)))
  ) {
    throw new TransactionInputError(
      "Enter a recurrence count from 1 to 10000.",
    );
  }
  data.recurrence_count = count ? Number(count) : null;
  if (!validTransaction(data)) {
    throw new TransactionInputError(
      "Enter a nonzero exact expense amount, or a positive income/transfer amount, valid date, wallets, category, and recurrence. Descriptions may contain at most 500 characters.",
    );
  }
  return data;
}

export function transactionSelection(ids) {
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 100 ||
    ids.some((id) => !validTransactionId(id)) ||
    new Set(ids).size !== ids.length
  ) {
    throw new TransactionInputError(
      "Select 1 to 100 different transaction series.",
    );
  }
  return ids;
}

export function bulkTransactionPayload(form) {
  const ids = transactionSelection(form.getAll("ids"));
  const fields = form.getAll("fields");
  const allowed = [
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
    "is_pinned",
  ];
  if (
    !fields.length ||
    fields.some((field) => !allowed.includes(field)) ||
    new Set(fields).size !== fields.length
  ) {
    throw new TransactionInputError("Choose the fields to change.");
  }
  const changes = {};
  for (const field of fields) {
    const raw = form.get(field);
    if (typeof raw !== "string")
      throw new TransactionInputError("Check the selected fields.");
    const value = raw.trim();
    if (field === "is_pinned") {
      if (!["true", "false"].includes(value))
        throw new TransactionInputError("Choose a valid pin setting.");
      changes[field] = value === "true";
    } else if (field === "recurrence_count") {
      if (value && (!/^[1-9]\d*$/.test(value) || Number(value) > 10000)) {
        throw new TransactionInputError(
          "Enter a recurrence count from 1 to 10000.",
        );
      }
      changes[field] = value ? Number(value) : null;
    } else if (field.endsWith("_id")) {
      changes[field] = value ? transactionId(value) : null;
      if (!value && ["source_wallet_id", "category_id"].includes(field)) {
        throw new TransactionInputError(
          "Choose a wallet and category for the selected fields.",
        );
      }
    } else if (field === "description") {
      if ([...value].length > 500)
        throw new TransactionInputError(
          "Use at most 500 description characters.",
        );
      changes[field] = value;
    } else if (field === "amount") {
      if (!decimalAmount.test(value) || !/[1-9]/.test(value.split(/[eE]/)[0])) {
        throw new TransactionInputError("Enter a nonzero exact amount.");
      }
      changes[field] = value;
    } else if (field === "date") {
      if (!validDate(value))
        throw new TransactionInputError("Choose a valid date.");
      changes[field] = value;
    } else if (field === "type") {
      if (!transactionTypes.includes(value))
        throw new TransactionInputError("Choose a valid type.");
      changes[field] = value;
    } else {
      if (value && !recurrenceFrequencies.includes(value))
        throw new TransactionInputError("Choose a valid recurrence.");
      changes[field] = value || null;
    }
  }
  if (
    changes.type &&
    changes.type !== "transfer" &&
    !("destination_wallet_id" in changes)
  )
    changes.destination_wallet_id = null;
  if ("category_id" in changes && !("subcategory_id" in changes))
    changes.subcategory_id = null;
  if (changes.recurrence === null) changes.recurrence_count = null;
  return { ids, changes };
}

export function transactionDateLabel(value, today) {
  if (!validDate(value) || !validDate(today))
    throw new TransactionInputError("Choose valid calendar dates.");
  if (value === today) return "Today";
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (value === yesterday.toISOString().slice(0, 10)) return "Yesterday";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
    ...(value.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}),
  }).format(new Date(`${value}T00:00:00Z`));
}

export function transactionDisplayAmount(item) {
  const refund = item.type === "expense" && item.amount.startsWith("-");
  return {
    amount: item.amount.replace(/^[+-]/, ""),
    sign:
      item.type === "transfer"
        ? ""
        : item.type === "income" || refund
          ? "+"
          : "-",
    positive: item.type === "income" || refund,
  };
}

export function transactionFilters(params = {}) {
  const result = {};
  const page = params.page ?? "1";
  if (
    typeof page !== "string" ||
    !/^[1-9]\d*$/.test(page) ||
    Number(page) > 2_147_483_647
  ) {
    throw new TransactionInputError("Choose a valid transaction page.");
  }
  result.page = Number(page);
  for (const key of [
    "q",
    "type",
    "wallet_id",
    "category_id",
    "subcategory_id",
    "date_from",
    "date_to",
  ]) {
    const value = params[key];
    if (value === undefined || value === "") continue;
    if (typeof value !== "string") {
      throw new TransactionInputError("Choose valid transaction filters.");
    }
    if (key.endsWith("_id")) transactionId(value);
    if (key.startsWith("date_") && !validDate(value)) {
      throw new TransactionInputError("Choose valid filter dates.");
    }
    if (key === "type" && !transactionTypes.includes(value)) {
      throw new TransactionInputError("Choose a valid transaction type.");
    }
    if (key === "q" && [...value.trim()].length > 500) {
      throw new TransactionInputError(
        "Search descriptions with at most 500 characters.",
      );
    }
    result[key] = value.trim();
  }
  if (result.date_from && result.date_to && result.date_from > result.date_to) {
    throw new TransactionInputError(
      "The start date must not follow the end date.",
    );
  }
  return result;
}

export function transactionQuery(filters, page = filters.page) {
  return new URLSearchParams(
    Object.entries({ ...filters, page }).map(([key, value]) => [
      key,
      String(value),
    ]),
  ).toString();
}

export function transactionMonthLabel(month) {
  if (typeof month !== "string" || !validDate(`${month}-01`)) {
    throw new TransactionInputError("Choose a valid transaction month.");
  }
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

export function shiftTransactionMonth(month, offset) {
  transactionMonthLabel(month);
  if (!Number.isInteger(offset)) {
    throw new TransactionInputError("Choose a valid transaction month.");
  }
  const [year, number] = month.split("-").map(Number);
  const index = year * 12 + number - 1 + offset;
  const nextYear = Math.floor(index / 12);
  if (nextYear < 1 || nextYear > 9999) return null;
  return `${String(nextYear).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export function transactionYearMonth(month, year) {
  transactionMonthLabel(month);
  if (typeof year !== "string" || !/^\d{1,4}$/.test(year) || Number(year) < 1) {
    throw new TransactionInputError("Choose a year from 1 to 9999.");
  }
  return `${year.padStart(4, "0")}-${month.slice(5)}`;
}

export function transactionView(params, today) {
  const filters = transactionFilters(params);
  const month =
    params.month ??
    (filters.date_from || filters.date_to ? "all" : today.slice(0, 7));
  if (typeof month !== "string") {
    throw new TransactionInputError("Choose a valid transaction month.");
  }
  if (month !== "all") {
    transactionMonthLabel(month);
    if (filters.date_from || filters.date_to) {
      throw new TransactionInputError(
        "Choose either a month or a custom date range, not both.",
      );
    }
    const end = new Date(`${month}-01T00:00:00Z`);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
    filters.date_from = `${month}-01`;
    filters.date_to = end.toISOString().slice(0, 10);
  }
  return { month, filters };
}

export function transactionViewQuery(filters, month, page = filters.page) {
  const query = new URLSearchParams(transactionQuery(filters, page));
  query.set("month", month);
  if (month !== "all") {
    query.delete("date_from");
    query.delete("date_to");
  }
  return query.toString();
}

export function transactionPeriodQuery(filters, month) {
  const query = new URLSearchParams(transactionViewQuery(filters, month, 1));
  query.delete("date_from");
  query.delete("date_to");
  return query.toString();
}
