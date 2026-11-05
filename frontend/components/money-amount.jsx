export function MoneyAmount({ amount, currency }) {
  const symbol = new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  })
    .formatToParts(0)
    .find((part) => part.type === "currency").value;
  return (
    <span title={currency}>
      <span aria-hidden="true">{symbol} </span>
      <span>{amount}</span>
      <span className="sr-only"> {currency}</span>
    </span>
  );
}
