from decimal import Decimal

from app.schemas.transactions import TransactionCurrencyCharts
from app.services.summary import plot_points


def transaction_charts(
    currencies: list[dict], categories: list[dict]
) -> list[TransactionCurrencyCharts]:
    charts = []
    for total in currencies:
        currency = total["currency"]

        def category_points(kind: str):
            return plot_points(
                [
                    (row["category_id"], row["category_name"], Decimal(row["amount"]))
                    for row in categories
                    if row["currency"] == currency and row["type"] == kind
                ]
            )

        charts.append(
            TransactionCurrencyCharts(
                currency=currency,
                expenses=category_points("expense"),
                income=category_points("income"),
                cashflow=plot_points(
                    [
                        (key, label, Decimal(total[key]))
                        for key, label in [
                            ("income", "Income"),
                            ("expense", "Expenses"),
                            ("net", "Net income"),
                        ]
                    ]
                ),
            )
        )
    return charts
