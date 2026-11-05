from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

CategoryIcon = Literal[
    "house",
    "heart-pulse",
    "shopping-basket",
    "utensils",
    "train-front",
    "shirt",
    "gamepad-2",
    "gift",
    "landmark",
    "circle-ellipsis",
    "plane",
    "car",
    "book-open",
    "coffee",
]
PresetKey = Literal[
    "casa",
    "salute",
    "spesa",
    "cibo-fuori",
    "trasporti",
    "abbigliamento",
    "leisure",
    "regali",
    "commissioni",
    "altro",
    "income-salary",
    "income-mealticket",
    "income-transfer",
    "income-cash",
    "income-other",
]
CategoryKind = Literal["expense", "income"]


class CategoryFields(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=100)
    colour: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")
    icon: CategoryIcon


class CategoryInput(CategoryFields):
    kind: CategoryKind = "expense"


class CategoryItem(CategoryFields):
    id: UUID

    model_config = ConfigDict(extra="ignore")


class Category(CategoryItem):
    kind: CategoryKind
    preset_key: str | None
    subcategories: list[CategoryItem] = Field(default_factory=list)


class CategoryList(BaseModel):
    categories: list[Category]


class CategoryPreset(CategoryInput):
    key: PresetKey
    subcategories: list[CategoryFields]


class PresetList(BaseModel):
    presets: list[CategoryPreset]


class PresetImport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    keys: list[PresetKey] = Field(min_length=1, max_length=15)


class ImportResult(BaseModel):
    imported: int
