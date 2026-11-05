from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

SidebarPage = Literal["dashboard", "wallets", "transactions", "summary", "comparison", "categories"]
DEFAULT_SIDEBAR_ORDER: list[SidebarPage] = [
    "dashboard",
    "wallets",
    "transactions",
    "summary",
    "comparison",
    "categories",
]


class Preferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    theme: Literal["light", "dark"]
    sidebar_order: list[SidebarPage] = Field(min_length=6, max_length=6)

    @field_validator("sidebar_order")
    @classmethod
    def unique_pages(cls, value: list[SidebarPage]) -> list[SidebarPage]:
        if len(set(value)) != len(DEFAULT_SIDEBAR_ORDER):
            raise ValueError("Include each sidebar page exactly once")
        return value
