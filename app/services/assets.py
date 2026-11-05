import calendar
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal, localcontext
from fractions import Fraction

from app.db.assets import annual_holdings
from app.schemas.assets import (
    AssetCurrencySummary,
    AssetGroupSummary,
    AssetHolding,
    AssetSummary,
    AssetTrendPoint,
    AssetValues,
)
from app.services.summary import chart_aggregates, money_axis_ticks, plot_points

GROUPS = {
    "cash": "Cash",
    "stocks": "Stocks / ETF",
    "crypto": "Crypto",
    "bonds": "Bonds",
    "other": "Other assets",
    "liabilities": "Liabilities",
}


def exact_sum(amounts: list[Decimal]) -> Decimal:
    return chart_aggregates(amounts)[0]


def percentage_change(current: Decimal, previous: Decimal) -> Decimal | None:
    if not previous:
        return None
    ratio = (Fraction(current) - Fraction(previous)) / abs(Fraction(previous)) * 100 * 10**18
    quotient, remainder = divmod(abs(ratio.numerator), ratio.denominator)
    rounded = quotient + (remainder * 2 >= ratio.denominator)
    with localcontext() as context:
        context.prec = max(28, len(str(rounded)) + 1)
        return Decimal(rounded if ratio >= 0 else -rounded).scaleb(-18)


async def asset_summary(subject: str, year: int, as_of: date | None = None) -> AssetSummary:
    as_of = as_of or datetime.now(UTC).date()
    start = date(year, 1, 1)
    checkpoints = [start - timedelta(days=1) if year > 1 else None] + [
        date(year, month, calendar.monthrange(year, month)[1]) for month in range(1, 13)
    ]
    checkpoints = [
        None
        if cutoff is None or (cutoff if i == 0 else cutoff.replace(day=1)) > as_of
        else min(cutoff, as_of)
        for i, cutoff in enumerate(checkpoints)
    ]
    rows, available = await annual_holdings(subject, checkpoints, as_of)
    holdings = {}
    for row in rows:
        key = (row["source"], row["id"], row["currency"])
        if key not in holdings:
            holdings[key] = {**row, "amounts": [None] * 13, "present": [False] * 13}
        holdings[key]["amounts"][row["period"]] = row["amount"]
        holdings[key]["present"][row["period"]] = available[row["period"]]
        holdings[key]["name"] = row["name"]
        holdings[key]["active"] = row["active"]
    for item in holdings.values():
        for i, cutoff in enumerate(checkpoints):
            if (
                cutoff is not None
                and available[i]
                and cutoff.replace(day=1) == as_of.replace(day=1)
                and not item["present"][i]
            ):
                item["amounts"][i] = Decimal(0)
    latest = max((i for i, cutoff in enumerate(checkpoints) if cutoff is not None), default=0)

    def values(amounts: list[Decimal | None]) -> AssetValues:
        return AssetValues(opening=amounts[0], months=amounts[1:], latest=amounts[latest])

    currencies = []
    for currency in sorted({row["currency"] for row in rows}):
        selected = sorted(
            (item for item in holdings.values() if item["currency"] == currency),
            key=lambda item: (item["name"], item["source"], str(item["id"])),
        )

        def totals(items: list[dict]) -> list[Decimal | None]:
            return [
                exact_sum([item["amounts"][i] for item in items if item["amounts"][i] is not None])
                if available[i]
                else None
                for i, cutoff in enumerate(checkpoints)
            ]

        groups = []
        for key, label in GROUPS.items():
            members = [item for item in selected if item["asset_group"] == key]
            if not members:
                continue
            groups.append(
                AssetGroupSummary(
                    key=key,
                    label=label,
                    values=values(totals(members)),
                    holdings=[
                        AssetHolding(**item, values=values(item["amounts"])) for item in members
                    ],
                )
            )
        assets = totals([item for item in selected if item["asset_group"] != "liabilities"])
        liabilities = totals([item for item in selected if item["asset_group"] == "liabilities"])
        net = [
            exact_sum([asset, liability.copy_negate()]) if asset is not None else None
            for asset, liability in zip(assets, liabilities, strict=True)
        ]
        missing = [
            sum(item["present"][i] and item["amounts"][i] is None for item in selected)
            if available[i]
            else 0
            for i, cutoff in enumerate(checkpoints)
        ]
        change, percent = [None] * 13, [None] * 13
        for i in range(1, 13):
            if (
                net[i] is not None
                and net[i - 1] is not None
                and not missing[i]
                and not missing[i - 1]
            ):
                change[i] = exact_sum([net[i], net[i - 1].copy_negate()])
                percent[i] = percentage_change(net[i], net[i - 1])
        known_trend = plot_points(
            [
                (str(i), calendar.month_abbr[i], amount)
                for i, amount in enumerate(net[1:], 1)
                if amount is not None
            ]
        )
        trend_by_key = {point.key: point for point in known_trend}
        allocation = plot_points(
            [
                (group.key, group.label, group.values.latest)
                for group in groups
                if group.key != "liabilities" and group.values.latest is not None
            ]
        )
        currencies.append(
            AssetCurrencySummary(
                currency=currency,
                groups=groups,
                assets=values(assets),
                liabilities=values(liabilities),
                net_worth=values(net),
                change=values(change),
                change_percent=values(percent),
                missing_values=missing,
                trend=[
                    AssetTrendPoint(
                        key=str(i),
                        label=calendar.month_abbr[i],
                        amount=net[i],
                        value=trend_by_key[str(i)].value if str(i) in trend_by_key else None,
                    )
                    for i in range(1, 13)
                ],
                allocation=allocation,
                net_worth_ticks=money_axis_ticks(
                    max((point.amount.copy_abs() for point in known_trend), default=Decimal(0)),
                    True,
                ),
                allocation_ticks=money_axis_ticks(
                    max((point.amount.copy_abs() for point in allocation), default=Decimal(0)),
                    any(point.amount < 0 for point in allocation),
                ),
            )
        )
    return AssetSummary(year=year, as_of=as_of, currencies=currencies)
