from app.db import categories
from app.schemas.categories import CategoryFields, CategoryPreset, PresetKey

_GROUPS = [
    (
        "casa",
        "Casa",
        "#3b82f6",
        "house",
        ["Affitto", "Gas", "Elettricit\u00e0", "Internet", "Telefono", "AltroCasa"],
    ),
    (
        "salute",
        "Salute",
        "#ef4444",
        "heart-pulse",
        ["Medicine", "Dottori", "Barbiere", "Sport", "AltroSalute"],
    ),
    ("spesa", "Spesa", "#22c55e", "shopping-basket", ["Supermercato", "AltroSpesa"]),
    ("cibo-fuori", "CiboFuori", "#f97316", "utensils", ["Locali&Bar", "Mensa", "Delivery"]),
    (
        "trasporti",
        "Trasporti",
        "#0ea5e9",
        "train-front",
        ["Viaggi", "Treno", "Bus", "Auto", "BusinessTrip", "AltroTrasporti"],
    ),
    ("abbigliamento", "Abbigliamento", "#a855f7", "shirt", ["MrClothing", "OtherClothing"]),
    (
        "leisure",
        "Leisure",
        "#6366f1",
        "gamepad-2",
        [
            "Tech",
            "Fumetti",
            "Libri",
            "Funko",
            "Carte",
            "Giochi",
            "Cinema",
            "Abbonamenti",
            "Esperienze",
            "OtherLeisure",
        ],
    ),
    ("regali", "Regali", "#ec4899", "gift", ["OtherRegali"]),
    (
        "commissioni",
        "Commissioni",
        "#64748b",
        "landmark",
        ["Brokers", "Exchanges", "Banks", "OtherFees"],
    ),
    ("altro", "Altro", "#78716c", "circle-ellipsis", ["OtherOther"]),
]

PRESETS = [
    CategoryPreset(
        key=key,
        name=name,
        colour=colour,
        icon=icon,
        subcategories=[CategoryFields(name=child, colour=colour, icon=icon) for child in children],
    )
    for key, name, colour, icon, children in _GROUPS
]
PRESETS += [
    CategoryPreset(
        key=key,
        kind="income",
        name=name,
        colour="#21634b",
        icon=icon,
        subcategories=[
            CategoryFields(name=child, colour="#21634b", icon=icon) for child in children
        ],
    )
    for key, name, icon, children in [
        ("income-salary", "Salary", "landmark", []),
        ("income-mealticket", "MealTicket", "utensils", []),
        ("income-transfer", "Transfer", "landmark", []),
        ("income-cash", "Cash", "landmark", []),
        ("income-other", "Other", "circle-ellipsis", ["refund", "private sell"]),
    ]
]


async def import_presets(subject: str, keys: list[PresetKey]) -> int:
    selected = {key for key in keys}
    return await categories.import_presets(subject, [p for p in PRESETS if p.key in selected])
