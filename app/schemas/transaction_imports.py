from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.categories import CategoryKind, PresetKey
from app.schemas.transactions import TransactionInput

MAX_IMPORT_ROWS = 500
MAX_IMPORT_COLUMNS = 32
MAX_CSV_BYTES = 512 * 1024
MAX_IMPORT_BODY_BYTES = 2 * 1024 * 1024
ImportField = Literal[
    "description",
    "amount",
    "date",
    "type",
    "source_wallet_id",
    "destination_wallet_id",
    "category_id",
    "subcategory_id",
    "recurrence",
    "recurrence_count",
]
Cell = Annotated[str, Field(max_length=1000, strict=True)]
Column = Annotated[int, Field(ge=0, lt=MAX_IMPORT_COLUMNS, strict=True)]


class ImportRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    number: int = Field(ge=2, le=MAX_IMPORT_ROWS + 1, strict=True)
    values: list[Cell] = Field(max_length=MAX_IMPORT_COLUMNS)
    included: bool = Field(default=True, strict=True)
    overrides: dict[ImportField, Cell] = Field(default_factory=dict)


class ImportDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    headers: list[Cell] = Field(min_length=1, max_length=MAX_IMPORT_COLUMNS)
    rows: list[ImportRow] = Field(min_length=1, max_length=MAX_IMPORT_ROWS)
    mapping: dict[ImportField, Column | None]


class ImportRequest(ImportDocument):
    import_id: UUID
    defaults: dict[ImportField, Cell] = Field(default_factory=dict)
    date_order: Literal["auto", "day-first", "month-first", "year-first"] = "auto"
    decimal_separator: Literal["auto", "dot", "comma"] = "auto"
    approved_creations: list[UUID] = Field(default_factory=list, max_length=MAX_IMPORT_ROWS * 4)

    @model_validator(mode="after")
    def valid_columns_and_rows(self) -> Self:
        columns = [index for index in self.mapping.values() if index is not None]
        if any(index >= len(self.headers) for index in columns):
            raise ValueError("Choose an existing CSV column")
        if len(columns) != len(set(columns)):
            raise ValueError("Map each CSV column to only one transaction field")
        if [row.number for row in self.rows] != list(range(2, len(self.rows) + 2)):
            raise ValueError("Keep CSV record numbers and order unchanged")
        return self


class ImportRowResult(BaseModel):
    number: int
    included: bool
    errors: dict[str, str]
    transaction: TransactionInput | None
    normalized: dict[Literal["amount", "date"], str] = Field(default_factory=dict)
    currency: str | None = None


class ReferenceCreation(BaseModel):
    id: UUID
    kind: Literal["wallet", "category", "subcategory"]
    name: str = Field(min_length=1, max_length=100)
    category_id: UUID | None = None
    parent_name: str | None = None
    colour: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    icon: str
    preset_key: PresetKey | None = None
    category_kind: CategoryKind | None = None


class ImportValidation(BaseModel):
    rows: list[ImportRowResult]
    selected: int
    invalid: int
    creations: list[ReferenceCreation] = Field(default_factory=list)
    creations_approved: bool = True


class ImportResult(BaseModel):
    imported: int
