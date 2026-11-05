from datetime import date
from decimal import Decimal
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SummaryFilters(BaseModel):
    model_config = ConfigDict(extra="forbid")

    year: int = Field(ge=1, le=9999)


class ExpenseTotals(BaseModel):
    months: list[Decimal] = Field(min_length=12, max_length=12)
    total: Decimal


class SubcategoryExpenses(ExpenseTotals):
    id: UUID | None
    name: str


class CategoryExpenses(ExpenseTotals):
    id: UUID
    name: str
    subcategories: list[SubcategoryExpenses]


class CurrencyExpenses(ExpenseTotals):
    currency: str
    categories: list[CategoryExpenses]


class ExpenseSummary(BaseModel):
    year: int
    as_of: date
    currencies: list[CurrencyExpenses]


class PlotPoint(BaseModel):
    key: str
    label: str
    amount: Decimal
    value: int = Field(ge=-10000, le=10000)


class CashFlowTotals(BaseModel):
    expenses: Decimal
    income: Decimal
    net: Decimal


class CurrencyCharts(BaseModel):
    currency: str
    ranking: list[PlotPoint]
    ranking_sum: Decimal
    ranking_average: Decimal
    totals: CashFlowTotals
    trend: list[PlotPoint]
    income_trend: list[PlotPoint]
    net_trend: list[PlotPoint]


class ExpenseAnalysis(BaseModel):
    summary: ExpenseSummary
    income_summary: ExpenseSummary
    charts: list[CurrencyCharts]


class ComparisonSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    year: int = Field(ge=1, le=9999, strict=True)
    month: int | None = Field(default=None, ge=1, le=12, strict=True)
    end_year: int | None = Field(default=None, ge=1, le=9999, strict=True)


class ExpenseComparisonInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["month", "year", "average"]
    periods: list[ComparisonSelection] = Field(min_length=2, max_length=6)

    @model_validator(mode="after")
    def consistent_periods(self) -> Self:
        if any((period.month is not None) != (self.kind == "month") for period in self.periods):
            raise ValueError("Choose a month only when comparing months")
        if any(
            (period.end_year is not None) != (self.kind == "average") for period in self.periods
        ):
            raise ValueError("Choose an end year only for yearly averages")
        if any(
            period.end_year is not None and period.end_year < period.year for period in self.periods
        ):
            raise ValueError("The end year must not precede the start year")
        keys = [(period.year, period.month, period.end_year) for period in self.periods]
        if len(set(keys)) != len(keys):
            raise ValueError("Choose distinct comparison periods")
        return self


class ComparisonPeriod(ComparisonSelection):
    key: str
    label: str
    months: int
    years: int


class ComparisonCategory(BaseModel):
    id: UUID
    name: str
    points: list[PlotPoint]


class CurrencyComparison(BaseModel):
    currency: str
    totals: list[PlotPoint]
    categories: list[ComparisonCategory]


class ExpenseComparison(BaseModel):
    kind: Literal["month", "year", "average"]
    as_of: date
    periods: list[ComparisonPeriod]
    currencies: list[CurrencyComparison]
