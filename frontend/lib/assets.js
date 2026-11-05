import { validDate, validTransactionId } from "./transactions.js";
import { decimalAmount, walletCurrencies } from "./wallets.js";

export const assetGroups = [
  { value: "cash", label: "Cash" },
  { value: "stocks", label: "Stocks / ETF" },
  { value: "crypto", label: "Crypto" },
  { value: "bonds", label: "Bonds" },
  { value: "other", label: "Other assets" },
  { value: "liabilities", label: "Liabilities" },
];

export class AssetInputError extends Error {}

export function negativeAmount(amount) {
  return amount.startsWith("-") && /[1-9]/.test(amount.split(/[eE]/)[0]);
}

export function validAssetPosition(item) {
  return (
    validTransactionId(item?.id) &&
    typeof item.name === "string" &&
    Boolean(item.name.trim()) &&
    [...item.name].length <= 100 &&
    assetGroups.some((group) => group.value === item.asset_group) &&
    walletCurrencies.includes(item.currency)
  );
}

export function assetId(value) {
  if (!validTransactionId(value))
    throw new AssetInputError("Choose a valid asset.");
  return value;
}

export function assetPayload(form, create = true) {
  const fields = create
    ? ["name", "asset_group", "currency", "date", "amount"]
    : ["date", "amount"];
  const data = Object.fromEntries(
    fields.map((key) => {
      const value = form.get(key);
      if (typeof value !== "string")
        throw new AssetInputError("Complete the asset valuation fields.");
      return [key, value.trim()];
    }),
  );
  const today = new Date().toISOString().slice(0, 10);
  if (
    !validDate(data.date) ||
    data.date > today ||
    !decimalAmount.test(data.amount) ||
    negativeAmount(data.amount) ||
    (create &&
      (!data.name ||
        [...data.name].length > 100 ||
        !assetGroups.some((group) => group.value === data.asset_group) ||
        !walletCurrencies.includes(data.currency)))
  ) {
    throw new AssetInputError(
      "Use a name up to 100 characters, an asset group, a supported currency, a date no later than today, and an exact nonnegative value. Enter debts as positive liabilities.",
    );
  }
  return data;
}
