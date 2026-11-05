from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.summary import MoneyAxisTick, PlotPoint
from app.schemas.transactions import TransactionInput
from app.schemas.wallets import WalletCreate

AssetGroup = Literal["cash", "stocks", "crypto", "bonds", "other", "liabilities"]


class AssetValuationInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    date: date
    amount: Decimal = Field(ge=0, allow_inf_nan=False)

    @field_validator("date", mode="before")
    @classmethod
    def calendar_date(cls, value: object) -> object:
        return TransactionInput.calendar_date(value)

    @field_validator("date")
    @classmethod
    def started_date(cls, value: date) -> date:
        if value > datetime.now(UTC).date():
            raise ValueError("Valuations cannot be dated in the future")
        return value

    @field_validator("amount", mode="before")
    @classmethod
    def exact_amount(cls, value: object) -> object:
        if isinstance(value, (float, bool)):
            raise ValueError("Use a decimal string or integer for an exact valuation")
        return value


class AssetCreate(AssetValuationInput):
    name: str = Field(min_length=1, max_length=100)
    asset_group: AssetGroup
    currency: str = "EUR"

    @field_validator("currency")
    @classmethod
    def supported_currency(cls, value: str) -> str:
        return WalletCreate.supported_currency(value)


class AssetPosition(BaseModel):
    id: UUID
    name: str
    asset_group: AssetGroup
    currency: str


class AssetValues(BaseModel):
    opening: Decimal | None
    months: list[Decimal | None] = Field(min_length=12, max_length=12)
    latest: Decimal | None


class AssetHolding(AssetPosition):
    source: Literal["wallet", "asset"]
    values: AssetValues


class AssetGroupSummary(BaseModel):
    key: AssetGroup
    label: str
    values: AssetValues
    holdings: list[AssetHolding]


class AssetTrendPoint(BaseModel):
    key: str
    label: str
    amount: Decimal | None
    value: int | None = Field(ge=-10000, le=10000)


class AssetCurrencySummary(BaseModel):
    currency: str
    groups: list[AssetGroupSummary]
    assets: AssetValues
    liabilities: AssetValues
    net_worth: AssetValues
    change: AssetValues
    change_percent: AssetValues
    missing_values: list[int] = Field(min_length=13, max_length=13)
    trend: list[AssetTrendPoint]
    allocation: list[PlotPoint]
    net_worth_ticks: list[MoneyAxisTick]
    allocation_ticks: list[MoneyAxisTick]


class AssetSummary(BaseModel):
    year: int
    as_of: date
    currencies: list[AssetCurrencySummary]
