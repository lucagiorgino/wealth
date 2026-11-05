from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

AccountIcon = Literal["user-round", "smile", "cat", "rocket"]


class AccountNameUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    display_name: str = Field(min_length=1, max_length=100)


class AccountUpdate(AccountNameUpdate):
    icon: AccountIcon


class AccountIconUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    icon: AccountIcon


class Account(BaseModel):
    subject: str
    display_name: str | None
    icon: AccountIcon
    avatar_url: str | None = None
