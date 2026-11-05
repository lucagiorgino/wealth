from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: SecretStr = SecretStr("")
    auth0_domain: str = Field(default="", pattern=r"^$|^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$")
    auth0_audience: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
