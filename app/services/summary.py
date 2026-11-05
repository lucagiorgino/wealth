import calendar
from datetime import UTC, date, datetime
from decimal import Decimal, localcontext
from fractions import Fraction

from app.db import summary
from app.db.expense_comparisons import comparison_totals
from app.schemas.summary import (
    CashFlowTotals,
    ComparisonCategory,
    ComparisonPeriod,
    CurrencyCharts,
    CurrencyComparison,
    ExpenseAnalysis,
    ExpenseComparison,
    ExpenseComparisonInput,
    ExpenseSummary,
    PlotPoint,
)


class InvalidExpenseComparison(ValueError):
    pass


async def expense_summary(subject: str, year: int) -> ExpenseSummary:
    return await summary.expense_summary(subject, year, datetime.now(UTC).date())


def plot_points(
    items: list[tuple[str, str, Decimal]], maximum: Decimal | None = None
) -> list[PlotPoint]:
    maximum = (
        max((item[2].copy_abs() for item in items), default=Decimal(0))
        if maximum is None
        else maximum.copy_abs()
    )
    return [
        PlotPoint(
            key=key,
            label=label,
            amount=amount,
            value=round(Fraction(amount) / Fraction(maximum) * 10000) if maximum else 0,
        )
        for key, label, amount in items
    ]


def chart_aggregates(amounts: list[Decimal]) -> tuple[Decimal, Decimal]:
    if not amounts:
        return Decimal(0), Decimal(0)
    with localcontext() as context:
        context.prec = (
            max(0, *(amount.adjusted() for amount in amounts))
            - min(-18, *(amount.as_tuple().exponent for amount in amounts))
            + len(str(len(amounts)))
            + 2
        )
        total = sum(amounts, Decimal(0))
        ratio = Fraction(total) * 10**18 / len(amounts)
        quotient, remainder = divmod(abs(ratio.numerator), ratio.denominator)
        rounded = quotient + (remainder * 2 >= ratio.denominator)
        average = Decimal(rounded if ratio >= 0 else -rounded).scaleb(-18)
    return total, average


def expense_charts(
    result: ExpenseSummary, income_summary: ExpenseSummary, net_months: dict[str, list[Decimal]]
) -> list[CurrencyCharts]:
    months = 12
    expenses = {item.currency: item for item in result.currencies}
    incomes = {item.currency: item for item in income_summary.currencies}
    charts = []
    for currency, net in sorted(net_months.items()):
        expense = expenses.get(currency)
        income = incomes.get(currency)
        expense_months = expense.months[:months] if expense else [Decimal(0)] * months
        income_months = income.months[:months] if income else [Decimal(0)] * months
        maximum = max(amount.copy_abs() for amount in [*expense_months, *income_months])

        def monthly_points(amounts: list[Decimal], scale: Decimal | None = None) -> list[PlotPoint]:
            return plot_points(
                [
                    (str(index + 1), calendar.month_abbr[index + 1], amount)
                    for index, amount in enumerate(amounts[:months])
                ],
                scale,
            )

        ranking = plot_points(
            [
                (str(category.id), category.name, category.total)
                for category in sorted(
                    expense.categories if expense else [],
                    key=lambda category: (
                        -Fraction(category.total),
                        category.name,
                        str(category.id),
                    ),
                )[:10]
            ]
        )
        ranking_sum, ranking_average = chart_aggregates([point.amount for point in ranking])
        charts.append(
            CurrencyCharts(
                currency=currency,
                ranking=ranking,
                ranking_sum=ranking_sum,
                ranking_average=ranking_average,
                totals=CashFlowTotals(
                    expenses=expense.total if expense else Decimal(0),
                    income=income.total if income else Decimal(0),
                    net=chart_aggregates(net)[0],
                ),
                trend=monthly_points(expense_months, maximum),
                income_trend=monthly_points(income_months, maximum),
                net_trend=monthly_points(net),
            )
        )
    return charts


async def expense_analysis(subject: str, year: int) -> ExpenseAnalysis:
    result, incomes, net_months = await summary.annual_summaries(
        subject, year, datetime.now(UTC).date()
    )
    return ExpenseAnalysis(
        summary=result, income_summary=incomes, charts=expense_charts(result, incomes, net_months)
    )


async def expense_comparison(
    subject: str, data: ExpenseComparisonInput, as_of: date | None = None
) -> ExpenseComparison:
    as_of = as_of or datetime.now(UTC).date()
    if any(
        date(period.year, period.month or 1, 1) > as_of
        or (period.end_year is not None and period.end_year > as_of.year)
        for period in data.periods
    ):
        raise InvalidExpenseComparison("Choose periods that have started by today's UTC date.")
    periods = [
        ComparisonPeriod(
            **period.model_dump(),
            key=f"p{index}",
            label=(
                f"{calendar.month_abbr[period.month]} {period.year}"
                if data.kind == "month"
                else f"{period.year}-{period.end_year} yearly average"
                if data.kind == "average"
                else str(period.year)
            ),
            months=(
                1
                if data.kind == "month"
                else ((period.end_year or period.year) - period.year) * 12
                + (as_of.month if (period.end_year or period.year) == as_of.year else 12)
            ),
            years=(period.end_year or period.year) - period.year + 1,
        )
        for index, period in enumerate(data.periods)
    ]
    rows = await comparison_totals(subject, data, as_of)
    currencies = []
    for currency in sorted({row["currency"] for row in rows}):
        owned_rows = [row for row in rows if row["currency"] == currency]
        totals = {row["index"]: row["amount"] for row in owned_rows if row["currency_total"]}
        categories = {}
        for row in owned_rows:
            if not row["currency_total"]:
                category = categories.setdefault(
                    row["category_id"], {"name": row["category_name"], "amounts": {}}
                )
                category["amounts"][row["index"]] = row["amount"]
        maximum = max(
            (row["amount"].copy_abs() for row in owned_rows if not row["currency_total"]),
            default=Decimal(0),
        )
        category_points = [
            ComparisonCategory(
                id=id,
                name=item["name"],
                points=plot_points(
                    [
                        (period.key, period.label, item["amounts"].get(index, Decimal(0)))
                        for index, period in enumerate(periods)
                    ],
                    maximum,
                ),
            )
            for id, item in sorted(
                categories.items(),
                key=lambda entry: (
                    -Fraction(
                        max(
                            entry[1]["amounts"].get(index, Decimal(0))
                            for index in range(len(periods))
                        )
                    ),
                    entry[1]["name"],
                    str(entry[0]),
                ),
            )
        ]
        currencies.append(
            CurrencyComparison(
                currency=currency,
                totals=plot_points(
                    [
                        (period.key, period.label, totals.get(index, Decimal(0)))
                        for index, period in enumerate(periods)
                    ]
                ),
                categories=category_points,
            )
        )
    return ExpenseComparison(kind=data.kind, as_of=as_of, periods=periods, currencies=currencies)
