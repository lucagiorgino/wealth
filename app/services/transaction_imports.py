import csv
import io
import re
from uuid import NAMESPACE_URL, UUID, uuid5

from pydantic import ValidationError

from app.schemas.categories import CategoryPreset
from app.schemas.transaction_imports import (
    MAX_CSV_BYTES,
    MAX_IMPORT_COLUMNS,
    MAX_IMPORT_ROWS,
    ImportDocument,
    ImportRequest,
    ImportRow,
    ImportRowResult,
    ImportValidation,
    ReferenceCreation,
)
from app.schemas.transactions import TransactionInput
from app.services.category_presets import PRESETS
from app.services.import_formats import detect_date_order, normalize_amount, normalize_date

FIELD_ALIASES = {
    "description": {"description", "desc", "memo", "details", "descriptiontext"},
    "amount": {"amount", "value", "transactionamount"},
    "date": {"date", "data", "transactiondate", "bookingdate"},
    "type": {"type", "transactiontype"},
    "source_wallet_id": {"sourcewalletid", "sourcewallet", "wallet", "account", "sourceaccount"},
    "destination_wallet_id": {"destinationwalletid", "destinationwallet", "destinationaccount"},
    "category_id": {"categoryid", "category", "maincategory"},
    "subcategory_id": {"subcategoryid", "subcategory"},
    "recurrence": {"recurrence", "frequency", "repeat"},
    "recurrence_count": {"recurrencecount", "repeatcount", "occurrences"},
}


class InvalidTransactionCSV(ValueError):
    pass


class InvalidTransactionImport(Exception):
    def __init__(self, report: ImportValidation):
        self.report = report


def parse_csv(data: bytes, delimiter: str = "auto") -> ImportDocument:
    if not data or len(data) > MAX_CSV_BYTES:
        raise InvalidTransactionCSV("Choose a nonempty CSV file up to 512 KiB.")
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise InvalidTransactionCSV("CSV files must use UTF-8 encoding.") from None
    if not text.strip():
        raise InvalidTransactionCSV("Include a header row and at least one data row.")
    if "\x00" in text:
        raise InvalidTransactionCSV("CSV files must not contain NUL characters.")
    if delimiter == "auto":
        try:
            delimiter = csv.Sniffer().sniff(text[:8192], delimiters=",;\t").delimiter
        except csv.Error:
            try:
                delimiter = csv.Sniffer().sniff(text.splitlines()[0], delimiters=",;\t").delimiter
            except csv.Error:
                delimiter = ","
    elif delimiter not in {",", ";", "\t"}:
        raise InvalidTransactionCSV("Choose comma, semicolon, tab, or automatic detection.")
    try:
        reader = csv.reader(io.StringIO(text, newline=""), delimiter=delimiter, strict=True)
        records = []
        for record in reader:
            if not record:
                continue
            if len(record) > MAX_IMPORT_COLUMNS or any(len(cell) > 1000 for cell in record):
                raise InvalidTransactionCSV("Use at most 32 columns and 1000 characters per cell.")
            records.append(record)
            if len(records) > MAX_IMPORT_ROWS + 1:
                raise InvalidTransactionCSV("Import at most 500 data rows at a time.")
    except csv.Error:
        raise InvalidTransactionCSV(
            "The CSV quoting is invalid. Check the file and delimiter."
        ) from None
    if len(records) < 2 or not any(header.strip() for header in records[0]):
        raise InvalidTransactionCSV("Include a header row and at least one data row.")
    headers = records[0]
    normalized = [re.sub(r"[^a-z0-9]", "", header.casefold()) for header in headers]
    mapping = {}
    for field, aliases in FIELD_ALIASES.items():
        matches = [index for index, name in enumerate(normalized) if name in aliases]
        mapping[field] = matches[0] if len(matches) == 1 else None
    return ImportDocument(
        headers=headers,
        rows=[ImportRow(number=index + 2, values=row) for index, row in enumerate(records[1:])],
        mapping=mapping,
    )


def matching_preset(value: str, category_kind: str | None = None) -> CategoryPreset | None:
    return next(
        (
            preset
            for preset in PRESETS
            if (category_kind is None or preset.kind == category_kind)
            and value.casefold() in {preset.name.casefold(), preset.key.casefold()}
        ),
        None,
    )


def resolve_reference(
    value: str | None, choices: list[dict], category_kind: str | None = None
) -> str | None:
    if not value:
        return None
    if category_kind is not None:
        choices = [item for item in choices if item["kind"] == category_kind]
    try:
        identifier = UUID(value)
    except ValueError:
        matches = [item for item in choices if item["name"].strip().casefold() == value.casefold()]
        if not matches:
            preset = matching_preset(value, category_kind)
            if preset is not None:
                matches = [item for item in choices if item.get("preset_key") == preset.key]
    else:
        matches = [item for item in choices if item["id"] == identifier]
    if len(matches) != 1:
        raise ValueError(
            "Choose an owned UUID or a unique matching name; this value is missing or ambiguous."
        )
    return str(matches[0]["id"])


def mapped_values(request: ImportRequest, row: ImportRow) -> dict:
    values = {}
    for field in FIELD_ALIASES:
        index = request.mapping.get(field)
        value = row.values[index].strip() if index is not None and index < len(row.values) else ""
        values[field] = (
            row.overrides.get(field, value or request.defaults.get(field, "")).strip() or None
        )
    return values


def creation_plan(
    subject: str,
    values: list[dict],
    wallets: list[dict],
    categories: list[dict],
    children: list[dict],
) -> list[ReferenceCreation]:
    creations = []

    def propose(value, kind, choices, parent=None, category_kind=None):
        if not value or len(value) > 100:
            return
        try:
            UUID(value)
        except ValueError:
            pass
        else:
            return
        candidates = (
            [item for item in choices if item["kind"] == category_kind]
            if kind == "category"
            else choices
        )
        if any(item["name"].strip().casefold() == value.casefold() for item in candidates):
            return
        preset = matching_preset(value, category_kind) if kind == "category" else None
        if preset and any(item.get("preset_key") == preset.key for item in candidates):
            return
        family = ":income" if kind == "category" and category_kind == "income" else ""
        identifier = uuid5(
            NAMESPACE_URL,
            f"wealth-import:{subject}:{kind}{family}:"
            f"{parent['id'] if parent else ''}:{value.casefold()}",
        )
        creation = ReferenceCreation(
            id=identifier,
            kind=kind,
            name=preset.name if preset else value,
            category_id=parent["id"] if parent else None,
            parent_name=parent["name"] if parent else None,
            colour=parent["colour"] if parent else preset.colour if preset else "#21634b",
            icon=parent["icon"]
            if parent
            else preset.icon
            if preset
            else "wallet"
            if kind == "wallet"
            else "circle-ellipsis",
            preset_key=preset.key if preset else None,
            category_kind=category_kind,
        )
        creations.append(creation)
        choices.append(
            {**creation.model_dump(), **({"kind": category_kind} if kind == "category" else {})}
        )

    for row in values:
        propose(row["source_wallet_id"], "wallet", wallets)
        if (row["type"] or "").casefold() == "transfer":
            propose(row["destination_wallet_id"], "wallet", wallets)
        propose(
            row["category_id"],
            "category",
            categories,
            category_kind="income" if (row["type"] or "").casefold() == "income" else "expense",
        )
    for row in values:
        try:
            parent_id = resolve_reference(
                row["category_id"],
                categories,
                "income" if (row["type"] or "").casefold() == "income" else "expense",
            )
        except ValueError:
            continue
        parent = next((item for item in categories if str(item["id"]) == parent_id), None)
        if parent is None:
            continue
        choices = [item for item in children if item["category_id"] == parent["id"]]
        before = len(creations)
        propose(row["subcategory_id"], "subcategory", choices, parent)
        if len(creations) > before:
            children.append(choices[-1])
    return creations


def validate_import(
    request: ImportRequest,
    wallets: list[dict],
    categories: list[dict],
    children: list[dict],
    *,
    subject: str,
) -> ImportValidation:
    wallets, categories, children = list(wallets), list(categories), list(children)
    all_values = [mapped_values(request, row) for row in request.rows]
    selected_values = [
        values for row, values in zip(request.rows, all_values, strict=True) if row.included
    ]
    creations = creation_plan(subject, selected_values, wallets, categories, children)
    detected_order = detect_date_order([values["date"] for values in selected_values])
    results = []
    for row, values in zip(request.rows, all_values, strict=True):
        errors = {}
        if len(row.values) != len(request.headers):
            errors["_row"] = "The number of values does not match the CSV header."
        normalized = {}
        currency = None
        if values["amount"]:
            try:
                values["amount"], currency = normalize_amount(
                    values["amount"], request.decimal_separator
                )
                normalized["amount"] = values["amount"]
            except ValueError as exc:
                errors["amount"] = str(exc)
        if values["date"]:
            try:
                values["date"] = normalize_date(values["date"], request.date_order, detected_order)
                normalized["date"] = values["date"]
            except ValueError as exc:
                errors["date"] = str(exc)
        for field, choices in [
            ("source_wallet_id", wallets),
            ("destination_wallet_id", wallets),
            ("category_id", categories),
        ]:
            try:
                values[field] = resolve_reference(
                    values[field],
                    choices,
                    ("income" if (values["type"] or "").casefold() == "income" else "expense")
                    if field == "category_id"
                    else None,
                )
            except ValueError as exc:
                errors[field] = str(exc)
                values[field] = None
        try:
            values["subcategory_id"] = resolve_reference(
                values["subcategory_id"],
                [item for item in children if str(item["category_id"]) == values["category_id"]],
            )
        except ValueError as exc:
            errors["subcategory_id"] = str(exc)
            values["subcategory_id"] = None
        if values["type"]:
            values["type"] = values["type"].casefold()
        if values["type"] == "transfer":
            source = next(
                (item for item in wallets if str(item["id"]) == values["source_wallet_id"]), None
            )
            destination = next(
                (item for item in wallets if str(item["id"]) == values["destination_wallet_id"]),
                None,
            )
            if (
                source
                and destination
                and source.get("currency", "EUR") != destination.get("currency", "EUR")
            ):
                errors["destination_wallet_id"] = (
                    "Transfers require wallets with the same currency."
                )
        if values["recurrence"]:
            values["recurrence"] = values["recurrence"].casefold()
            values["recurrence"] = {
                "none": None,
                "yearly": "annually",
                "annual": "annually",
            }.get(values["recurrence"], values["recurrence"])
        count = values["recurrence_count"]
        if count is not None:
            if re.fullmatch(r"[1-9]\d{0,4}", count):
                values["recurrence_count"] = int(count)
            else:
                errors["recurrence_count"] = "Use a whole count from 1 to 10000, or leave it blank."
                values["recurrence_count"] = None
        values["description"] = values["description"] or ""
        required = ["amount", "date", "type", "source_wallet_id", "category_id"]
        if values["type"] == "transfer":
            required.append("destination_wallet_id")
        for field in required:
            if values[field] is None:
                errors.setdefault(
                    field,
                    "This required field is missing. "
                    "Map a column, choose a fallback, or correct this row.",
                )
        transaction = None
        try:
            transaction = TransactionInput.model_validate(values)
            if (
                transaction.amount.adjusted() > 131071
                or transaction.amount.as_tuple().exponent < -16383
            ):
                errors["amount"] = "The amount exceeds PostgreSQL decimal precision limits."
        except ValidationError as exc:
            for error in exc.errors(include_input=False, include_context=False):
                field = str(error["loc"][0]) if error["loc"] else "_row"
                errors.setdefault(field, error["msg"])
        results.append(
            ImportRowResult(
                number=row.number,
                included=row.included,
                errors=errors,
                transaction=None if errors else transaction,
                normalized=normalized,
                currency=currency,
            )
        )
    return ImportValidation(
        rows=results,
        selected=sum(row.included for row in results),
        invalid=sum(row.included and bool(row.errors) for row in results),
        creations=creations,
        creations_approved=all(item.id in request.approved_creations for item in creations),
    )
