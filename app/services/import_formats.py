import re
from datetime import date, datetime

from app.core.currencies import CURRENCY_CODES

# Recognized monetary markers are stripped, not converted or persisted as currency.
CURRENCY_MARKERS = sorted(
    CURRENCY_CODES
    | {
        "$",
        "€",
        "£",
        "¥",
        "₹",
        "₩",
        "₽",
        "₺",
        "₫",
        "฿",
        "₴",
        "₪",
        "₦",
        "₱",
        "₡",
        "₲",
        "₵",
        "₭",
        "₮",
        "₸",
        "₼",
        "₾",
        "US$",
        "CA$",
        "C$",
        "A$",
        "AU$",
        "NZ$",
        "HK$",
        "R$",
        "S$",
        "NT$",
        "kr",
    },
    key=len,
    reverse=True,
)


def normalize_amount(value: str, separator: str = "auto") -> tuple[str, str | None]:
    text = value.strip().replace("\u00a0", " ").replace("\u202f", " ").replace("’", "'")
    leading_sign = ""
    if text.startswith(("+", "-")):
        leading_sign, text = text[0], text[1:].strip()
    currency = None
    for marker in CURRENCY_MARKERS:
        if text.casefold().startswith(marker.casefold()):
            currency, text = marker, text[len(marker) :].strip()
            break
        if text.casefold().endswith(marker.casefold()):
            currency, text = marker, text[: -len(marker)].strip()
            break
    match = re.fullmatch(r"([+-]?)([0-9][0-9., ']*|[.,][0-9]+)([eE][+-]?[0-9]+)?", text)
    if not match or (leading_sign and match[1]):
        raise ValueError("Use a decimal amount with a recognized currency symbol or code.")
    sign, mantissa, exponent = match[1], match[2].strip(), match[3] or ""
    punctuation = [character for character in mantissa if character in ".,"]
    if separator == "auto":
        if "." in punctuation and "," in punctuation:
            decimal = punctuation[-1]
        elif len(punctuation) == 1:
            decimal = punctuation[0]
        else:
            decimal = None
    else:
        decimal = "." if separator == "dot" else ","
    if decimal and mantissa.count(decimal) > 1:
        raise ValueError("Check the amount grouping and choose its decimal separator.")
    if decimal and decimal in mantissa:
        integer, fraction = mantissa.rsplit(decimal, 1)
        if fraction and (not fraction.isascii() or not fraction.isdigit()):
            raise ValueError("Use digits after the decimal separator.")
    else:
        integer, fraction = mantissa, None
    grouping = set(integer) - set("0123456789")
    if grouping:
        if len(grouping) != 1:
            raise ValueError("Use a consistent thousands separator in the amount.")
        group = next(iter(grouping))
        if not re.fullmatch(r"[0-9]{1,3}(?:" + re.escape(group) + r"[0-9]{3})+", integer):
            raise ValueError("Thousands groups must contain exactly three digits.")
        integer = integer.replace(group, "")
    normalized = (leading_sign or sign) + (integer or "0")
    if fraction is not None:
        normalized += "." + fraction
    return normalized + exponent, currency


def detect_date_order(values: list[str | None]) -> str | None:
    orders = set()
    for value in values:
        match = re.fullmatch(r"([0-9]{1,2})([./-])([0-9]{1,2})\2([0-9]{4})", value or "")
        if match:
            first, second = int(match[1]), int(match[3])
            if 12 < first <= 31 and 1 <= second <= 12:
                month, day, order = second, first, "day-first"
            elif 12 < second <= 31 and 1 <= first <= 12:
                month, day, order = first, second, "month-first"
            else:
                continue
            try:
                date(int(match[4]), month, day)
            except ValueError:
                continue
            orders.add(order)
    return next(iter(orders)) if len(orders) == 1 else None


def normalize_date(value: str, order: str = "auto", detected: str | None = None) -> str:
    if re.match(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ]", value):
        try:
            return datetime.fromisoformat(value).date().isoformat()
        except ValueError:
            raise ValueError("Use a valid ISO date or timestamp.") from None
    if re.fullmatch(r"[0-9]{8}", value):
        parts = (int(value[:4]), int(value[4:6]), int(value[6:]))
    else:
        match = re.fullmatch(r"([0-9]{1,4})([./-])([0-9]{1,2})\2([0-9]{1,4})", value)
        if not match:
            raise ValueError("Use a valid date with a four-digit year and /, - or . separators.")
        first, middle, last = int(match[1]), int(match[3]), int(match[4])
        if len(match[1]) == 4:
            parts = (first, middle, last)
        elif len(match[4]) == 4:
            chosen = detected if order == "auto" else order
            if chosen is None:
                candidates = []
                for month, day in [(middle, first), (first, middle)]:
                    try:
                        candidates.append(date(last, month, day))
                    except ValueError:
                        continue
                if len(set(candidates)) == 1:
                    return candidates[0].isoformat()
                if candidates:
                    raise ValueError("This date is ambiguous. Choose day-first or month-first.")
                raise ValueError("Use a valid calendar date.")
            if chosen == "year-first":
                raise ValueError("Use a year-first date or choose a matching date order.")
            parts = (last, middle, first) if chosen == "day-first" else (last, first, middle)
        else:
            raise ValueError("Use a four-digit year to avoid an ambiguous century.")
    try:
        return date(*parts).isoformat()
    except ValueError:
        raise ValueError("Use a valid calendar date.") from None
