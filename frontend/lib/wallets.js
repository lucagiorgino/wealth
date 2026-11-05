export const walletIcons = [
  { value: "wallet", label: "Wallet" },
  { value: "landmark", label: "Bank" },
  { value: "credit-card", label: "Credit card" },
  { value: "piggy-bank", label: "Savings" },
  { value: "banknote", label: "Cash" },
  { value: "custom", label: "Custom favicon" },
];

export const walletTypes = ["bank", "trading", "exchange"];
export const walletCurrencyOptions = [
  { value: "EUR", label: "Euro (EUR)" },
  { value: "USD", label: "Dollar (USD)" },
  { value: "GBP", label: "Sterling (GBP)" },
  { value: "BTC", label: "Bitcoin (BTC)" },
  { value: "ETH", label: "Ethereum (ETH)" },
  { value: "ITL", label: "Italian lira (ITL)" },
];

export const decimalAmount = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

export const walletCurrencies = (
  "AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD " +
  "BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB " +
  "EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK " +
  "JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA " +
  "MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK " +
  "PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN " +
  "SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST " +
  "XAF XCD XCG XOF XPF YER ZAR ZMW ZWG BTC ETH ITL"
).split(" ");

export class WalletInputError extends Error {}

export function faviconUrl(value) {
  const message = "Enter a direct public HTTPS favicon URL.";
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > 2048
  ) {
    throw new WalletInputError(message);
  }
  const url = value.trim();
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.hash ||
      (parsed.port && parsed.port !== "443")
    ) {
      throw new WalletInputError(message);
    }
  } catch (error) {
    if (error instanceof WalletInputError) throw error;
    if (!(error instanceof TypeError)) throw error;
    throw new WalletInputError(message);
  }
  return url;
}

export function walletId(value) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new WalletInputError("Choose a valid wallet.");
  }
  return value;
}

export function walletPage(value = "1") {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value) ||
    Number(value) > 2_147_483_647
  ) {
    throw new WalletInputError("Choose a valid wallet page.");
  }
  return Number(value);
}

export function walletPayload(form) {
  const data = {};
  for (const field of ["name", "colour", "icon"]) {
    const value = form.get(field);
    if (typeof value !== "string" || !value.trim()) {
      throw new WalletInputError("Name, colour, and icon are required.");
    }
    data[field] = value.trim();
  }
  if (!walletIcons.some((option) => option.value === data.icon)) {
    throw new WalletInputError("Choose a wallet icon.");
  }
  data.type = form.get("type") ?? "bank";
  if (!walletTypes.includes(data.type)) {
    throw new WalletInputError("Choose a wallet type.");
  }
  if (data.icon === "custom") {
    const url = form.get("favicon_url");
    if (url !== null && typeof url !== "string") {
      throw new WalletInputError("Enter a direct public HTTPS favicon URL.");
    }
    if (url?.trim()) {
      data.favicon_url = faviconUrl(url);
    }
  }
  const amount = form.get("initial_amount");
  const currency = form.get("currency");
  if (currency !== null && typeof currency !== "string") {
    throw new WalletInputError("Choose a supported currency.");
  }
  data.currency = currency === null ? "EUR" : currency.trim().toUpperCase();
  if (!walletCurrencies.includes(data.currency)) {
    throw new WalletInputError("Choose a supported currency.");
  }
  if (amount !== null && typeof amount !== "string") {
    throw new WalletInputError("Enter a valid initial amount.");
  }
  if (amount?.trim()) {
    if (!decimalAmount.test(amount.trim())) {
      throw new WalletInputError("Enter a valid initial amount.");
    }
    data.initial_amount = amount.trim();
  }
  return data;
}
