from datetime import date as CalendarDate
from datetime import datetime
from decimal import Decimal
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator, model_validator

from app.schemas.wallets import WalletAppearance

TransactionType = Literal["income", "expense", "transfer"]
Recurrence = Literal["weekly", "monthly", "annually"]


class TransactionInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    description: str = Field(default="", max_length=500)
    type: TransactionType
    amount: Decimal = Field(allow_inf_nan=False)
    date: CalendarDate
    source_wallet_id: UUID
    destination_wallet_id: UUID | None = None
    category_id: UUID
    subcategory_id: UUID | None = None
    recurrence: Recurrence | None = None
    recurrence_count: int | None = Field(default=None, ge=1, le=10000, strict=True)

    @field_validator("amount", mode="before")
    @classmethod
    def exact_amount(cls, value: object) -> object:
        if not isinstance(value, (str, int, Decimal)) or isinstance(value, bool):
            raise ValueError("Use an exact decimal string or integer for the amount")
        return value

    @field_validator("amount")
    @classmethod
    def amount_direction(cls, value: Decimal, info: ValidationInfo) -> Decimal:
        if value == 0 or (value < 0 and info.data.get("type") != "expense"):
            raise ValueError(
                "Expenses require a nonzero amount; income and transfers require positive amounts"
            )
        return value

    @field_validator("date", mode="before")
    @classmethod
    def calendar_date(cls, value: object) -> object:
        if isinstance(value, str) and len(value) == 10:
            try:
                return CalendarDate.fromisoformat(value)
            except ValueError:
                pass
        elif isinstance(value, CalendarDate) and not isinstance(value, datetime):
            return value
        raise ValueError("Use a calendar date in YYYY-MM-DD format")

    @model_validator(mode="after")
    def consistent_relationships(self) -> Self:
        if self.type == "transfer":
            if self.destination_wallet_id is None:
                raise ValueError("Transfers require a destination wallet")
            if self.destination_wallet_id == self.source_wallet_id:
                raise ValueError("Transfer wallets must be different")
        elif self.destination_wallet_id is not None:
            raise ValueError("Only transfers have a destination wallet")
        if self.recurrence is None and self.recurrence_count is not None:
            raise ValueError("A recurrence count requires a recurrence frequency")
        return self


class Transaction(TransactionInput):
    id: UUID
    created_at: datetime
    is_pinned: bool


class TransactionOccurrence(Transaction):
    occurrence_date: CalendarDate
    occurrence_number: int
    source_wallet_name: str
    destination_wallet_name: str | None
    category_name: str
    subcategory_name: str | None
    currency: str


class TransactionCurrencyTotals(BaseModel):
    currency: str
    income: Decimal
    expense: Decimal
    transfer: Decimal
    net: Decimal


class WalletExpenseTotal(BaseModel):
    wallet_id: UUID
    wallet_name: str
    currency: str
    amount: Decimal


class TransactionSummary(BaseModel):
    currencies: list[TransactionCurrencyTotals]
    wallet_expenses: list[WalletExpenseTotal]


class TransactionList(BaseModel):
    transactions: list[TransactionOccurrence]
    page: int
    page_size: int
    total: int
    as_of: CalendarDate
    summary: TransactionSummary


class TransactionFilters(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    page: int = Field(default=1, ge=1, le=2_147_483_647)
    page_size: int = Field(default=10, ge=1, le=100)
    q: str = Field(default="", max_length=500)
    type: TransactionType | None = None
    wallet_id: UUID | None = None
    category_id: UUID | None = None
    subcategory_id: UUID | None = None
    date_from: CalendarDate | None = None
    date_to: CalendarDate | None = None

    @model_validator(mode="after")
    def ordered_dates(self) -> Self:
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("The start date must not follow the end date")
        return self


class WalletOption(WalletAppearance):
    id: UUID
    name: str
    currency: str


class TransactionOptions(BaseModel):
    wallets: list[WalletOption]


class TransactionSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ids: list[UUID] = Field(min_length=1, max_length=100)

    @field_validator("ids")
    @classmethod
    def unique_ids(cls, value: list[UUID]) -> list[UUID]:
        if len(set(value)) != len(value):
            raise ValueError("Select each transaction series only once")
        return value


class TransactionChanges(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    description: str | None = Field(default=None, max_length=500)
    type: TransactionType | None = None
    amount: Decimal | None = Field(default=None, allow_inf_nan=False)
    date: CalendarDate | None = None
    source_wallet_id: UUID | None = None
    destination_wallet_id: UUID | None = None
    category_id: UUID | None = None
    subcategory_id: UUID | None = None
    recurrence: Recurrence | None = None
    recurrence_count: int | None = Field(default=None, ge=1, le=10000, strict=True)
    is_pinned: bool | None = Field(default=None, strict=True)

    @field_validator("amount", mode="before")
    @classmethod
    def exact_amount(cls, value: object) -> object:
        return TransactionInput.exact_amount(value)

    @field_validator("date", mode="before")
    @classmethod
    def calendar_date(cls, value: object) -> object:
        return TransactionInput.calendar_date(value)

    @model_validator(mode="after")
    def meaningful_changes(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("Choose at least one field to change")
        nullable = {"destination_wallet_id", "subcategory_id", "recurrence", "recurrence_count"}
        if any(
            getattr(self, field) is None for field in self.model_fields_set.difference(nullable)
        ):
            raise ValueError("Required transaction fields cannot be cleared")
        return self


class TransactionBulkUpdate(TransactionSelection):
    changes: TransactionChanges


class TransactionBulkResult(BaseModel):
    count: int = Field(ge=1, le=100)
