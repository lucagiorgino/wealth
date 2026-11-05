from base64 import b64encode
from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator

from app.core.currencies import CURRENCY_CODES

WalletIcon = Literal["wallet", "landmark", "credit-card", "piggy-bank", "banknote", "custom"]
WalletType = Literal["bank", "trading", "exchange"]


class WalletIconPreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    favicon_url: str = Field(min_length=1, max_length=2048)


class WalletIconPreview(BaseModel):
    icon_image_url: str


class WalletCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=100)
    colour: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")
    icon: WalletIcon
    initial_amount: Decimal = Field(default=Decimal("0"), allow_inf_nan=False)
    currency: str = "EUR"
    type: WalletType = "bank"
    favicon_url: str | None = Field(default=None, min_length=1, max_length=2048)

    @field_validator("currency")
    @classmethod
    def supported_currency(cls, value: str) -> str:
        value = value.upper()
        if value not in CURRENCY_CODES:
            raise ValueError("Choose a supported currency code")
        return value

    @field_validator("initial_amount", mode="before")
    @classmethod
    def exact_amount(cls, value: object) -> object:
        if isinstance(value, (float, bool)):
            raise ValueError("Use a decimal string or integer for an exact initial amount")
        return value


class WalletAppearance(BaseModel):
    colour: str
    icon: WalletIcon
    favicon_png: bytes | None = Field(default=None, exclude=True)

    @computed_field
    @property
    def icon_image_url(self) -> str | None:
        if self.favicon_png is None:
            return None
        return "data:image/png;base64," + b64encode(self.favicon_png).decode("ascii")


class Wallet(WalletAppearance):
    id: UUID
    name: str
    type: WalletType
    initial_amount: Decimal
    currency: str
    current_amount: Decimal
    balance_as_of: date
    created_at: datetime


class WalletList(BaseModel):
    wallets: list[Wallet]
    page: int
    page_size: int
    total: int
