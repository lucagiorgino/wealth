# API reference

FastAPI publishes OpenAPI at `/openapi.json` and Swagger UI at `/docs`.

| Method/path                                             | Authentication            | Result                                                                                      |
| ------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------- |
| `GET /health`                                           | Public                    | 200 `{"status":"ok"}` if the process is responding                                          |
| `GET /ready`                                            | Public                    | 200 `{"status":"ready"}` after PostgreSQL `SELECT 1`; 503 if unconfigured/unavailable       |
| `GET /api/v1/me`                                        | Auth0 bearer access token | 200 `{"subject":"<verified sub>"}`                                                          |
| `GET /api/v1/account`                                   | Auth0 bearer access token | 200 the signed-in user's Wealth profile                                                     |
| `GET /api/v1/settings`                                  | Auth0 bearer access token | 200 the signed-in user's theme and sidebar order |
| `PUT /api/v1/settings`                                  | Auth0 bearer access token | 200 saved theme and complete sidebar order |
| `PUT /api/v1/account`                                   | Auth0 bearer access token | 200 the saved display name and profile icon                                                 |
| `PUT /api/v1/account/avatar`                            | Auth0 bearer access token | 200 profile with validated, normalized custom image                                         |
| `DELETE /api/v1/account/avatar`                         | Auth0 bearer access token | 200 profile with custom image removed                                                       |
| `GET /api/v1/wallets`                                   | Auth0 bearer access token | 200 `{"wallets":[...],"page":1,"page_size":10,"total":N}`, restricted to the verified owner |
| `POST /api/v1/wallets`                                  | Auth0 bearer access token | 201 created wallet, owned by the verified subject                                           |
| `POST /api/v1/wallets/icon-preview`                     | Auth0 bearer access token | 200 normalized private favicon preview, without database access or persistence |
| `PUT /api/v1/wallets/{id}`                              | Auth0 bearer access token | 200 replaced owned wallet and recomputed balance |
| `DELETE /api/v1/wallets/{id}`                           | Auth0 bearer access token | 204, deletes an owned wallet only when unreferenced |
| `GET /api/v1/transactions`                              | Auth0 bearer access token | 200 filtered, paginated transaction occurrences and owner-scoped total                      |
| `GET /api/v1/transactions/options`                      | Auth0 bearer access token | 200 all owned wallet choices and stored appearance |
| `PATCH /api/v1/transactions/bulk`                       | Auth0 bearer access token | 200 atomic partial update/pinning of 1–100 owned definitions |
| `DELETE /api/v1/transactions/bulk`                      | Auth0 bearer access token | 200 atomic deletion of 1–100 owned definitions |
| `POST /api/v1/transactions`                             | Auth0 bearer access token | 201 created transaction/recurring-series definition                                         |
| `GET /api/v1/transactions/{id}`                         | Auth0 bearer access token | 200 owned transaction/series definition                                                     |
| `PUT /api/v1/transactions/{id}`                         | Auth0 bearer access token | 200 replaced transaction/series definition                                                  |
| `DELETE /api/v1/transactions/{id}`                      | Auth0 bearer access token | 204, deletes the transaction or entire recurring series                                     |
| `GET /api/v1/categories`                                | Auth0 bearer access token | 200 `{"categories":[...]}` with owned subcategories nested under each parent                |
| `GET /api/v1/categories/presets`                        | Auth0 bearer access token | 200 optional predefined groups, without creating owned records                              |
| `POST /api/v1/categories/import`                        | Auth0 bearer access token | 200 `{"imported":N}` newly copied groups                                                    |
| `POST /api/v1/categories`                               | Auth0 bearer access token | 201 created main category                                                                   |
| `PUT /api/v1/categories/{id}`                           | Auth0 bearer access token | 200 edited main category                                                                    |
| `DELETE /api/v1/categories/{id}`                        | Auth0 bearer access token | 204, deletes the category and its subcategories                                             |
| `POST /api/v1/categories/{id}/subcategories`            | Auth0 bearer access token | 201 created subcategory                                                                     |
| `PUT /api/v1/categories/{id}/subcategories/{sub_id}`    | Auth0 bearer access token | 200 edited subcategory                                                                      |
| `DELETE /api/v1/categories/{id}/subcategories/{sub_id}` | Auth0 bearer access token | 204, deletes only the selected subcategory                                                  |

Versioned API responses carry `Cache-Control: private, no-store`, including
authentication failures. There is no browser-facing token exchange endpoint,
or local password API.

## Identity

Send `Authorization: Bearer <access-token>` over HTTPS outside loopback/local
development. Auth0, not this application, issues tokens.

Use an Auth0 API with RS256 signing. Its identifier must exactly match
`AUTH0_AUDIENCE` in both applications, and its tenant must match `AUTH0_DOMAIN`.
The backend uses the official Auth0 FastAPI SDK for token validation.

Missing/unsupported bearer credentials return 401 with `WWW-Authenticate: Bearer`.
Tokens rejected by the SDK return its failure status with a generic error.
SDK server failures return 503 without provider-internal details. Missing backend
Auth0 configuration returns 503 when verification is requested. A verified token
without a nonblank string subject returns 401. There is no additional OAuth
permission requirement for `/api/v1/me`.

Only the subject is returned. Arbitrary claims and provider tokens are not
included in the identity response. An identity response does not imply that
financial records or a local account have been provisioned.

## Workspace settings

`GET /api/v1/settings` returns the verified user's preferences:

```json
{
  "theme": "light",
  "sidebar_order": ["dashboard", "wallets", "transactions", "summary", "comparison", "categories"]
}
```

`PUT /api/v1/settings` requires both fields and returns the saved object.
`theme` is exactly `light` or `dark`. `sidebar_order` must contain all six
listed IDs exactly once, in the requested display order. Missing, duplicate,
unknown or extra fields (including owner/subject IDs) return 422.
The account menu remains fixed outside the reordered functionality list.
`comparison` opens the dedicated `/compare-spending` page. Migration 014 inserts
it immediately after Summary in existing saved orders, preserving the relative
order of the other features and all other preferences.

Ownership comes exclusively from the verified token subject. Reads return the
above defaults only after a successful database read and do not provision users.
Writes atomically insert a user if necessary or replace only preference columns,
preserving profile names/images and financial records. Profile, wallet and category
writes likewise preserve saved settings. Database failures return 503, never
default data or a successful save. All responses are private/no-store.

## Account management

`GET /api/v1/account` returns `subject`, `display_name`, `icon`, and `avatar_url` for the
verified subject. If the user has not yet provisioned a local user row,
it returns `display_name: null`, `icon: "user-round"`, and `avatar_url: null` without inserting a
database row. Wallet/category-created users have the same defaults until they save a
profile. These are intentional initial settings, not a fallback for database
errors.

`PUT /api/v1/account` replaces the current user's editable Wealth profile:

```json
{
  "display_name": "Alex",
  "icon": "cat"
}
```

Both fields are required. The display name is trimmed and must contain 1 to 100
characters. Supported icons are `user-round`, `smile`, `cat`, and `rocket`.
Names need not be unique. Unsupported values and extra fields, including
`subject`, owner identifiers, and email, return 422. The verified token subject
is the only account selector; users cannot read or edit another user's profile.
No additional OAuth permission is required.

Saving atomically inserts a user if necessary or updates only its name/icon
columns, preserving an imported image and existing wallets. Reading does not provision users.
Database failures return 503 on reads and writes, never a default profile or a
fake success. All responses are private/no-store.

`PATCH /api/v1/account` accepts only `{"display_name": "Alex"}` with the same
name validation. It atomically saves the name without changing the icon or image,
including when a picture is being saved concurrently. It can provision a user
with the default Person icon and no custom image.

`PUT /api/v1/account/icon` accepts only `{"icon": "cat"}`. This selects an
existing icon as the profile picture, atomically saving the icon and clearing
any custom image, even when choosing the previously stored icon. It preserves
the display name and financial records, and can provision a user without a name.
Both endpoints return the full account, enforce the verified subject, reject
extra fields with 422, and retain the same authentication/no-store/error contract.

These settings are local to Wealth. They do not update Auth0's name, picture,
email, password, login methods, or security settings. Account deletion and
identity-provider account management are not implemented.

### Custom profile images

`PUT /api/v1/account/avatar` accepts the **raw binary image body**, not JSON,
base64 input, an external URL, or multipart data. Set `Content-Type` to
`image/png`, `image/jpeg`, or `image/webp`. The body must be nonempty and at most
2 MiB (2097152 bytes), including requests without `Content-Length`. Each image
side must be at most 4096 pixels. Animated images, SVG, GIF, malformed/truncated
images, decompression bombs, and mismatched declared/decoded formats are refused.

Pillow verifies and decodes accepted images in a worker thread, applies EXIF
orientation, resizes to fit within 256 by 256 pixels without stretching, and
re-encodes a fresh PNG without source metadata. Only this normalized PNG is
stored; no original filename, image, EXIF/location data, or remote URL is retained.
The database bounds stored bytes to 327680 (320 KiB) and checks the PNG signature.

The response is the full account object. `avatar_url` is either null or
`data:image/png;base64,...`, containing only the normalized image. A custom
image and an existing icon are alternative representations of one profile
picture in the sidebar, account preview, and dashboard. A non-null image is the
active picture; selecting an icon through `/account/icon` clears it. The account
page provides one selector and preview, not independent icon/image settings.
There is no public/download-by-user-ID image route, and the
frontend never sends a bearer token from the browser to retrieve images.

`DELETE /api/v1/account/avatar` returns the full account with `avatar_url: null`.
It is idempotent and does not provision an absent user. Importing an image may
provision a minimal user, preserving default name/icon until separately saved.
Both operations derive ownership only from verified `sub`, preserve all other
profile and financial records, and are private/no-store.

| Failure                                                                       | Status                                                             |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Missing/rejected identity                                                     | 401 (provider/configuration failures follow the identity contract) |
| Unsupported or missing content type                                           | 415                                                                |
| Body larger than 2 MiB                                                        | 413                                                                |
| Empty/invalid image, format mismatch, animation, or dimensions over the limit | 422                                                                |
| Database unavailable                                                          | 503                                                                |

Failed imports leave the previously saved image unchanged. Provider profile
photos and credentials are never modified.

## Wallets

Users can create, edit, and delete multiple wallets. All endpoints require authentication, but
no additional OAuth permission. Ownership is determined by the verified token
subject, never a request field. Unknown fields, including owner identifiers, are
rejected with 422. Listing a user with no wallets returns an empty list.

Example creation body:

```json
{
  "name": "Everyday",
  "colour": "#3b82f6",
  "icon": "wallet",
  "initial_amount": "1250.50",
  "currency": "EUR",
  "type": "bank"
}
```

| Field            | Contract                                                                              |
| ---------------- | ------------------------------------------------------------------------------------- |
| `name`           | Required nonblank string, trimmed, at most 100 characters                             |
| `colour`         | Required `#RRGGBB` hex string, case-insensitive                                       |
| `icon`           | Required: `wallet`, `landmark`, `credit-card`, `piggy-bank`, `banknote`, or `custom` |
| `initial_amount` | Optional finite decimal string or integer JSON value, default `0`; negatives accepted |
| `currency` | Optional supported three-letter code, default `EUR`; trimmed and uppercased; null/unknown codes rejected |
| `type` | Optional `bank`, `trading`, or `exchange`, default `bank`; null/unknown types rejected |
| `favicon_url` | Optional direct public HTTPS image URL, at most 2048 characters; only accepted with `icon: "custom"` |

Fractional JSON numbers, booleans, null, NaN, and infinity are rejected. Send
decimal strings to avoid binary floating-point loss. Amounts are returned as
strings and stored as PostgreSQL `numeric` without currency-specific rounding.

The currency allowlist is maintained in [`app/core/currencies.py`](../app/core/currencies.py),
with matching frontend choices and PostgreSQL constraint.
The create/edit currency picker offers Euro (`EUR`), Dollar (`USD`), Sterling
(`GBP`), Bitcoin (`BTC`), Ethereum (`ETH`), and Italian lira (`ITL`).
Previously supported API codes remain valid so existing wallets and their
transaction history are not rewritten; an existing wallet with another code
retains that option when edited. Currency selection does not enable conversion,
crypto integrations, exchange connectivity, or asset tracking.

The creation response contains `id` (UUID), `name`, `colour`, `icon`,
`type`, `icon_image_url`, `initial_amount`, `currency`, `current_amount`, `balance_as_of` (UTC date), and
`created_at` (timestamp). Listing returns those objects
inside `wallets`, ordered by creation time and UUID. Owner identifiers are not
included in either response. Names are not unique.

### Wallet pagination

`GET /api/v1/wallets?page=1&page_size=10` performs pagination in PostgreSQL.
`page` defaults to `1` and must be an integer from `1` to `2147483647`.
`page_size` defaults to `10` and must be an integer from `1` to `100`.
Invalid values return 422.

The response includes the requested `page`, `page_size`, and `total` number of
wallets owned by the verified subject, not a global count. Both the count and
the ordered `LIMIT`/`OFFSET` query use that subject and a shared read-only,
repeatable-read transaction snapshot. Empty users and pages beyond the end
return an empty `wallets` array with the actual owner-scoped total. Requests
are independent snapshots, so newly created wallets can change later totals.

The first successful wallet creation inserts a minimal local user row if absent
and its wallet in one transaction. Existing account settings are preserved.
Validation failures return 422 and persistence failures
return 503, not a fake saved wallet or empty successful list. No automatic
retry is performed for writes.

### Custom wallet favicons

Select `icon: "custom"` and supply `favicon_url` when creating a wallet or
replacing its image. The authenticated API downloads the image before writing
the wallet. Only HTTPS on port 443 is permitted; embedded credentials, URL
fragments, private/non-global or multicast DNS results, and redirects are refused.
The TLS connection pins a checked DNS address while verifying the original
hostname; no credentials, cookies, or bearer tokens are sent to the image host.
Use a direct image URL, not a website page or favicon-discovery service.

`POST /api/v1/wallets/icon-preview` accepts only
`{"favicon_url":"https://example.com/favicon.ico"}` (a trimmed nonblank string
of at most 2048 characters) and returns `{"icon_image_url":"data:image/png;base64,..."}`.
It requires the same authentication and uses exactly the same URL, download,
size, normalization, timeout, and error rules as saving. It does not access the
database, provision users, change wallets, or retain the URL/image. Extra fields
and invalid inputs return 422; responses are private/no-store.

The wallet form requests a preview automatically after a 350 ms pause in URL
input, shows loading or explicit refusal feedback, and ignores results for
outdated URLs or a closed form. Clearing the URL restores an existing saved icon
(or the custom placeholder for a new wallet). A successful preview is not a
save: submitting the wallet independently downloads/validates the image again
before persisting it.

Static PNG, JPEG, WebP, and ICO images are accepted, up to 2 MiB and 4096 pixels
per side. The existing bounded Pillow normalization produces a metadata-free
PNG no larger than 256 pixels per side. PostgreSQL stores only the normalized
bytes, limited to 320 KiB and checked for a PNG signature. Neither the source
URL nor the original image/metadata is stored. Responses embed a private
`data:image/png;base64,...` in `icon_image_url`; built-in icons return null.
The browser does not contact the source image host on page loads.

An edit with `icon: "custom"` and no URL preserves an existing custom image;
without one it returns 422. Selecting a built-in icon clears the saved image.
Unsupported URLs/content and failed remote HTTP responses return 422;
DNS/network/TLS/timeouts return an explicit 503. Refusals leave existing wallet
fields/images unchanged. Requests are bounded by network timeouts and a
four-second service deadline. Images remain subject to normal wallet ownership
and private/no-store response rules.

### Wallet balances, editing, and deletion

`current_amount` is an exact decimal string calculated as initial amount plus
income minus expenses, plus incoming transfers minus outgoing transfers. It
counts only occurrences dated on or before `balance_as_of` (today UTC), using
the same anchored recurrence projection as transaction history. Future entries,
including a series' first future entry, do not affect a current balance.
Finite/indefinite recurrence, transaction edits/deletions, and confirmed imports
are reflected on the next read without stored balance updates or a scheduler.
Negative balances are allowed. Reads do not provision users or change initial amounts.
No rounding, exchange-rate conversion, or cross-currency totals are provided.

`PUT /api/v1/wallets/{id}` fully replaces editable fields using the creation
schema and defaults, returning the same wallet response with recomputed balance.
Changing the initial amount explicitly recalculates the balance; IDs, creation
timestamps, transaction references, and account preferences remain unchanged.
Currency changes are refused with 409
`Currency cannot change while wallet has transactions` if any definition
(including future entries) references the wallet.

`DELETE /api/v1/wallets/{id}` returns an empty 204 response. A wallet referenced
as either source or destination refuses deletion with 409
`Wallet is used by transactions`; no transactions are cascaded away.
Missing/foreign IDs both return 404 `Wallet not found`. Invalid UUIDs return 422.
Ownership checks, reference checks, and mutations share one transaction and row lock;
concurrent transaction writes cannot bypass these safeguards. Responses are private/no-store.

## Transactions

All endpoints require a verified bearer subject, with no additional permission.
Ownership is derived only from that subject. Reads never provision users.
`POST` creates a single transaction or recurring-series definition; `PUT`
fully replaces its editable fields using the same closed request body:

```json
{
  "description": "Monthly rent",
  "amount": "1250.50",
  "date": "2026-01-31",
  "type": "expense",
  "source_wallet_id": "11111111-1111-4111-8111-111111111111",
  "destination_wallet_id": null,
  "category_id": "22222222-2222-4222-8222-222222222222",
  "subcategory_id": null,
  "recurrence": "monthly",
  "recurrence_count": 12
}
```

| Field                   | Contract                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `description`           | Optional trimmed string, at most 500 characters; omitted/blank becomes `""`, explicit null is rejected                                    |
| `amount`                | Required nonzero finite exact decimal string or integer; expenses may be negative, income/transfers must be positive; no floats, booleans, NaN, or infinity |
| `date`                  | Required calendar date `YYYY-MM-DD`, years 0001 through 9999; original start date for recurrence                                          |
| `type`                  | Required `income`, `expense`, or `transfer`                                                                                               |
| `source_wallet_id`      | Required owned wallet UUID; the receiving wallet for income                                                                               |
| `destination_wallet_id` | Required distinct owned wallet UUID for transfers; null/omitted for all other types                                                       |
| `category_id`           | Required owned main-category UUID, including transfers                                                                                    |
| `subcategory_id`        | Optional/null owned child UUID belonging to the selected main category                                                                    |
| `recurrence`            | Optional/null for a single transaction; otherwise `weekly`, `monthly`, or `annually`                                                      |
| `recurrence_count`      | Optional/null for indefinite recurrence; otherwise an integer from 1 through 10000, including the first occurrence; requires `recurrence` |

Creation returns these fields plus `id` (UUID), `created_at` (timestamp), and
`is_pinned` (boolean, initially false). Full replacement preserves the saved pin;
`is_pinned` is changed through the bulk endpoint, not accepted in POST/PUT inputs.
Description is always returned as a string, including `""` when absent.
Replacing a transaction with an omitted/blank description clears its description;
the frontend displays a display-only "Untitled transaction" label for empty descriptions.
`GET /{id}` and `PUT /{id}` return the same definition shape. Amounts are always
returned as strings, without currency rounding. Owner identifiers are never
returned or accepted. Transfers are one definition, not two independent records.
Transactions do not mutate wallet initial amounts. Wallet reads compute current
balances from due occurrences. Amounts use the source wallet's currency;
negative expenses reduce expense totals and increase the source wallet balance.
They retain type `expense`, including for recurrence, editing, import, and summaries;
they are not converted to income. Zero and negative zero are rejected for every
type. Income must reference an owned `income` category; expenses and actual
wallet transfers must reference an owned `expense` category. Children inherit
their parent's family. An owned category of the wrong family returns 422;
foreign/missing/wrong-parent references still return 404. PostgreSQL independently
enforces the transaction/category family using a generated `category_kind` and
composite foreign key. The generated field is not accepted or returned by the API.
Transfers require matching source/destination currencies, otherwise 422
`Transfers require wallets with the same currency`. No conversion is performed.

Missing/foreign transaction IDs return the same 404 `Transaction not found`.
Missing/foreign wallets/categories and wrong-parent subcategories return the
same 404 `Transaction reference not found`, without revealing which reference
failed. References are checked/locked within the write transaction, and composite
foreign keys independently enforce ownership and hierarchy. Input violations,
including extra fields, return 422. Database failures return 503, not fake
saved/deleted entries or empty successful lists. Writes are not automatically
retried. All versioned responses, including failures, are private/no-store.

### Recurrence and edit/delete scope

A recurring row is a series definition, not an eagerly inserted batch of future
transactions. Listing projects occurrences due through today's UTC date and
reports that date as `as_of`. The first entry always exists, even when its date
is in the future; later future occurrences are not shown, even if a future
`date_to` is supplied. Weekly repeats advance seven days. Monthly and annual
repeats derive independently from the original start date, clamping to the last
valid day of shorter months: January 31 becomes February 28/29 then March 31;
February 29 annual series return to February 29 in leap years.

Indefinite recurrence requires no scheduler or background writes and catches up
automatically on the next read after downtime. Finite recurrence stops at the
specified total count. `occurrence_number` is one-based; `(id, occurrence_number)`
identifies an occurrence. `date` remains the original start date and
`occurrence_date` is the projected entry's date.

**Editing or deleting any recurring entry targets its definition and affects
the entire series, including all past occurrences.** Replacing recurrence with
null turns it into a single transaction. Individual occurrence exceptions,
"this and future" edits, pause/resume, and a future-occurrence preview are not
implemented. The frontend states this scope and confirms deletion.

### Transaction filters and pagination

`GET /api/v1/transactions?page=1&page_size=10` returns:

```json
{
  "transactions": [],
  "page": 1,
  "page_size": 10,
  "total": 0,
  "as_of": "2026-11-03",
  "summary": {
    "currencies": [],
    "wallet_expenses": []
  }
}
```

Each list item contains all definition fields plus `occurrence_date`,
`occurrence_number`, `source_wallet_name`, nullable `destination_wallet_name`,
`category_name`, nullable `subcategory_name`, and `currency` (the source wallet's
supported currency code). Names reflect current owned
wallet/category labels. This also supplies the original definition for editing.

Pagination uses the wallet endpoint's bounds: page 1 through 2147483647,
page size 1 through 100. Optional filters are combined with AND:

| Query                  | Meaning                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `q`                    | Case-insensitive literal description substring, trimmed, at most 500 characters; `%` and `_` are not wildcards |
| `type`                 | `income`, `expense`, or `transfer`                                                                             |
| `wallet_id`            | Source **or** transfer destination UUID                                                                        |
| `category_id`          | Main-category UUID                                                                                             |
| `subcategory_id`       | Subcategory UUID                                                                                               |
| `date_from`, `date_to` | Inclusive occurrence-date bounds; start cannot follow end                                                      |

Omit unset filters rather than sending blank enum/UUID/date values. Invalid
queries and unknown query fields return 422. Valid unknown/foreign filter UUIDs
match no owned records. Results are ordered by `is_pinned` descending, then occurrence date descending,
creation timestamp descending, UUID ascending, then occurrence number ascending.
Count, summary, and bounded rows use the verified owner, the same filters, and one
read-only repeatable-read snapshot; `total` counts occurrences, not definitions.
Empty or out-of-range pages contain an empty array and the actual filtered total.
Separate requests are independent snapshots and may reflect edits or newly due
occurrences.

### Bulk updates, deletion and pins

`PATCH /api/v1/transactions/bulk` accepts a closed body:

```json
{
  "ids": ["11111111-1111-4111-8111-111111111111"],
  "changes": {"description": "Updated description", "is_pinned": true}
}
```

`ids` contains 1–100 unique transaction-definition UUIDs, not occurrence identifiers.
`changes` must be nonempty and contain only editable transaction fields from the
creation contract or strict boolean `is_pinned`. Unspecified fields remain unchanged.
Only destination wallet, subcategory, recurrence and recurrence count may be null.
Each merged definition must satisfy the full transaction contract; callers must
explicitly clear/replace dependent fields when changing type, category or recurrence.
Pin-only changes leave all financial fields untouched.

`DELETE /api/v1/transactions/bulk` accepts `{"ids":["..."]}` with the same bounds.
Both operations return `{"count":1}`, counting changed/deleted definitions,
not occurrences. Every selected row is owner-scoped and locked in deterministic
UUID order inside one transaction. Missing/foreign IDs return the same 404.
Invalid merged changes return 422; reference and persistence failures retain
their normal 404/422/503 contracts. Any failure rolls back the entire batch.
There is no partial success, silent omission or automatic retry.

Editing, deleting or pinning a recurring occurrence affects its whole series,
including occurrences outside the current page/filter. Pins persist with the
owned definition and apply to all its occurrences. Pinned matching occurrences
sort first before pagination; pins never bypass filters, create future repeats,
or affect balances, counts or summaries. The UI selects unique definitions only
on the current page and clears selection when the page/filters change.

### Transaction summary

The listing's `summary` covers every matching occurrence before pagination, not
only `transactions` on this page. It uses the same recurrence/date/filter scope,
including an initial future entry when that entry matches the list.
It is a transaction-flow summary, not an initial/current wallet balance.

`currencies` contains one object per matched currency, ordered by code:
`currency`, `income`, `expense`, `transfer`, and `net`. The four amounts are exact
decimal strings computed in PostgreSQL. Income/transfer totals are nonnegative;
expense totals can have either sign.
`net` is income minus signed expenses and may have either sign.
Each transfer is counted once, and never enters `net`.
Currencies are never added together or converted.

`wallet_expenses` contains only wallets with matching expenses, ordered by name
then UUID. Each object has `wallet_id`, `wallet_name`, `currency`, and exact
decimal-string `amount`. Expenses belong to the source wallet; income and
transfers never enter this breakdown. No owner fields are returned.
For no matches both arrays are empty. Out-of-range pages still return the complete
filtered summary, just as they retain the actual filtered count.
The count and summary share one materialized filtered projection and the paginated
rows share its read-only repeatable-read snapshot. No aggregates are stored,
and no unpaginated financial rows are sent to the browser.

`GET /api/v1/transactions/options` returns
`{"wallets":[{"id":"...","name":"...","currency":"EUR","colour":"#123abc","icon":"wallet","icon_image_url":null}]}`,
ordered by name and UUID. It includes all owned wallets, not only the first
wallet page, and no balances or owner fields. Custom icons use the wallet's
normalized private PNG data URL, never a remote URL or raw stored bytes.
The existing category list supplies
the owned two-level category choices.

### Reviewed CSV transaction imports

All import endpoints require verified identity and return private/no-store
responses. Upload/validation/recap approval are read-only: no user, wallet,
category, subcategory, transaction, import receipt,
temporary file, or server-side staging record is created. Cancellation drops the
browser's document and makes no mutation request.

`POST /api/v1/transactions/import/upload?delimiter=auto` accepts raw `text/csv`
bytes, not multipart data. CSVs must be nonempty UTF-8 (an optional BOM is
accepted), at most 512 KiB, with a header, 1–500 data records, at most 32 columns,
and at most 1000 characters per cell. Comma, semicolon, and tab delimiters and
quoted/multiline cells are supported. `delimiter` may be `auto`, `,`, `;`, or tab.
Auto detection tries the sample then the header, falling back to comma; explicitly
choose a delimiter if detection is unsuitable. Empty physical records are
ignored; records containing empty cells are retained and validated.
Malformed quoting/encoding/limits return 422; stream overflow returns 413;
unsupported media types return 415. Filenames are not transmitted or persisted.

The response contains `headers`, `mapping`, and `rows`. Mapping keys are the ten
`TransactionInput` fields; values are zero-based column indexes or null.
Normalized known header aliases (such as `memo`, `amount`, `date`, `data`,
`wallet`, `category`) are matched automatically. Multiple candidate columns
remain unmapped rather than being guessed. Rows have sequential logical CSV
record `number`s starting at 2, string `values`, `included: true`, and empty
`overrides`. Record numbers are not physical line numbers for multiline CSVs.
A data record with a different cell count is retained with a row-level error.

`POST /api/v1/transactions/import/validate` and `/confirm` accept the same closed
JSON body, bounded to 2 MiB:

```json
{
  "import_id": "dcb055ba-d0c4-4fe8-888b-e7f3c21d19ab",
  "headers": ["Memo", "Value", "Date"],
  "rows": [
    {
      "number": 2,
      "values": ["Groceries", "12.123456789", "2026-01-31"],
      "included": true,
      "overrides": {}
    }
  ],
  "mapping": { "description": 0, "amount": 1, "date": 2 },
  "date_order": "auto",
  "decimal_separator": "auto",
  "approved_creations": [],
  "defaults": {
    "type": "expense",
    "source_wallet_id": "Everyday",
    "category_id": "Food"
  }
}
```

Each CSV column may map to only one field. Unmapped/blank cells use explicitly
chosen `defaults`; a row's `overrides` take precedence, including an explicit
empty string to clear an optional value. Both dictionaries allow only known
transaction fields and string values. Ownership fields are forbidden. All
records and their original numbering stay in the request, including excluded
records (`included: false`). No amount passes through a JavaScript number.

References accept owned UUIDs or unique case-insensitive trimmed names.
Category lookup, preset aliases, proposal deduplication, and child resolution are
restricted to the transaction's family (`income`, otherwise `expense`). Identical
names can exist in both families and resolve independently. A wrong-family UUID
is a row error, not a request to create or silently reuse another category.
Missing plain names generate a proposed creation recap; blank required values,
unknown/foreign UUIDs, and ambiguous existing names remain errors. Only included
rows propose records; non-transfer destination values do not propose wallets.
Repeated names are deduplicated case-insensitively, and subcategories are scoped
to their selected parent, whether owned or proposed.

Main-category references also check the predefined catalogue by
case-insensitive name or preset key. An exact owned name or owned UUID takes
precedence. Otherwise, a matching owned `preset_key` reuses that private copy,
including one renamed by its owner. If no copy is owned, the recap proposes the
catalogue's canonical name, colour, icon, and `preset_key`; repeated name/key
aliases share one proposal. Nothing is created during lookup or approval.
Only included rows' referenced categories/children are proposed, not an entire
template group. Existing owned names and styling are never overwritten.

Each `creations` item has a stable subject-scoped UUID `id`, `kind` (`wallet`,
`category`, or `subcategory`), `name`, `colour`, and `icon`. Subcategories also
have `category_id` and `parent_name`; these are null for the other kinds.
`preset_key` is nullable and is set only for a new matched main category.
`category_kind` is `income` or `expense` for category proposals, null for wallet/
subcategory proposals. Approval recaps identify the family; stable proposal
identifiers distinguish otherwise identical names in different families.
New wallets use colour `#21634b`, icon `wallet`, currency EUR, and initial amount zero; new
unmatched main categories use the same colour and icon `circle-ellipsis`.
Matched main categories use their predefined appearance. New children
inherit their parent's colour/icon. The frontend shows this recap before
transaction review. Approving sends the proposed UUIDs in `approved_creations`
(at most 2000) to another read-only validation request. `creations_approved`
is true only when all current proposals are covered. Edits clear UI approval;
changed proposals must be reviewed again. Approval does not create anything.

Description is optional: an unmapped, missing, or blank value becomes `""`.
Nonzero finite exact decimal (negative only for expenses), ISO `YYYY-MM-DD` date, type, source
wallet, and main category are required; transfers also need a distinct
destination with the same currency. A mismatch is a destination-wallet row alert;
confirmation revalidates and writes nothing on refusal.
The existing transaction/recurrence rules apply. Types/frequencies
are case-insensitive; `annual`/`yearly` mean `annually`, and `none` means no repeat.
Counts are blank or whole numbers from 1 to 10000. PostgreSQL numeric precision
limits are checked before inserting.

CSV amounts accept a recognized prefix or suffix currency marker, including
common symbols such as `$`, `€`, `£`, `¥`, and supported codes such as USD/EUR.
Unknown markers, multiple markers, and malformed grouping produce an amount
alert on that row. The recognition allowlist is maintained in
[`import_formats.py`](../app/services/import_formats.py), with codes shared from
[`currencies.py`](../app/core/currencies.py). Markers are normalized, not used to
change a wallet's currency; amounts use the selected wallet's denomination.
This does not perform currency conversion.
ASCII digits remain exact strings: `€ 1.234,56` becomes `1234.56`, and
`12,50 EUR` becomes `12.50`, without float conversion or rounding.
Space (including nonbreaking variants) or apostrophe thousands groups are
supported; grouping must consistently contain three digits.
`decimal_separator` accepts `auto` (default), `dot`, or `comma`. Auto uses the
last punctuation as decimal when both `.` and `,` occur, a single punctuation
as decimal, or repeated punctuation as valid thousands grouping. To interpret
`$1,234` as `1234` rather than `1.234`, explicitly choose `dot`.

CSV dates accept four-digit-year numeric forms with `/`, `-`, or `.`,
year-first forms, compact `YYYYMMDD`, and valid ISO timestamps. Timestamps keep
their represented calendar date without timezone conversion. `date_order`
accepts `auto` (default), `day-first`, `month-first`, or `year-first`.
Auto uses valid, unambiguous included dates to infer a consistent day/month
order for other rows. Conflicting evidence or an isolated `03/04/2026` produces
a row alert rather than guessing; choose the matching date order and revalidate.
Invalid dates and two-digit years remain errors. All accepted dates become
`YYYY-MM-DD` before transaction validation.

Validation returns `rows`, `selected`, `invalid`, `creations`, and
`creations_approved`. Each row has `number`, `included`, `errors`, `transaction`,
`normalized` (successfully parsed amount/date strings), and `currency` (recognized
marker or null). The review shows normalized values alongside the original cells
and explains that currency is not converted. Each invalid row identifies
its fields in `errors`; `_row` identifies inconsistent relationships or column
count. Invalid rows have `transaction: null`. Excluded-row errors remain visible
but do not contribute to `invalid`. The frontend can edit mappings/defaults,
correct individual rows, exclude any rows, and revalidate.

Confirmation returns 201 `{"imported":N}` only when at least one row is selected
and every selected row is valid with its current creation plan approved.
A subject-scoped advisory lock serializes CSV reference creation; already-created
uniquely named records are reused. Confirmation rechecks current owned references
under key-share locks, provisions a minimal user if needed, and inserts approved
wallets/categories/subcategories, selected transaction/series definitions, and a
retry receipt in one database transaction. Any error rolls back the whole batch.
Invalid selection returns 422 with a `detail` and the fresh `validation` report.
Database failures return 503, never partial success.
If a manual category write wins a name race after confirmation's reference
snapshot, confirmation returns the category-name 409 refusal and rolls back all
import writes. Revalidate/retry to reuse the now-existing category or child.

`import_id` is a per-upload UUID retry key scoped to verified identity. Identical
confirmed requests with the same key return the original count without inserting
again, including concurrent retries. Reusing a committed key with different
data returns 409. Successful receipts store only owner/key, a SHA-256 request
hash, count, and timestamp in `transaction_imports`; original CSV/preview content
is not stored. New uploads use new keys: this is retry protection, not duplicate
file detection. Once confirmation is sent, an interrupted response must be
retried unchanged before discarding the workflow; cancellation cannot undo an
already committed import. Imported entries are managed through normal CRUD.

## Annual expense analysis

`GET /api/v1/summary?year=2024` requires a verified identity and an explicit
calendar `year` from 1 through 9999. Unknown query fields and invalid/missing
years return 422. Responses are private/no-store; unavailable PostgreSQL returns
503 rather than zero totals.

```json
{
  "year": 2024,
  "as_of": "2026-11-04",
  "currencies": []
}
```

`as_of` is today's UTC date. Only owned **expense** occurrences within the selected
calendar year and due by `as_of` contribute. Income, transfers, initial wallet
amounts, future initial entries, and future repetitions are excluded.
Past years include the complete year; the current year is year-to-date; future
years are empty. Weekly/monthly/annual finite or indefinite recurrence uses the
same original-date-anchored projection as history and wallet balances.

Each `currencies` item has `currency`, `months`, `total`, and `categories`.
`months` is exactly twelve signed decimal strings in January–December order,
including `"0"` for months without expenses. `total` is the exact selected-year
sum. Decimal strings may use exponent notation; consumers must not convert
amounts to floats or round them. Currencies are ordered by code and never combined
or converted.

Each category has `id`, current `name`, `months`, `total`, and `subcategories`.
Each subcategory has `id`, current `name`, `months`, and `total`. Categories and
children are ordered by name then UUID; a direct-main-category bucket comes first
with `id: null` and `name: "Without subcategory"`. It is not a persisted
subcategory. Only categories/children with matching expense activity are returned.
A category's totals include its children and direct bucket; currency totals count
each occurrence once, not the sum of duplicated subtotal/detail rows.
No owner fields or raw transactions are returned.

One read-only PostgreSQL statement computes all monthly/yearly leaf, category,
and currency totals with grouping sets. Python only assembles the resulting
hierarchy; the browser performs no monetary arithmetic. Reads never provision
users or save aggregate rows. Series-wide transaction edits/deletion and category
renames are reflected by the next request. No migration or scheduler is required.
See [the implemented sequence](IMPLEMENTATION_STATUS.md#annual-expense-analysis).

### Charts and period comparisons

`GET /api/v1/summary/analysis?year=N` returns `{summary, income_summary, charts}`. `summary`
retains the annual contract above; the original annual endpoint remains available.
`income_summary` has the same year, UTC cutoff, twelve-month/year totals and
category/subcategory hierarchy, but includes only owned due income occurrences.
Its amounts are nonnegative. It is rendered after the expense tables.
Both families and monthly net amounts come from one read-only grouping-sets
statement and the same occurrence snapshot. Transfers, initial wallet amounts,
foreign records and future occurrences never enter these totals.

Each chart has `currency`, `ranking` (the ten largest category totals, descending,
with name/UUID tie-breaks), `trend` (chronological monthly expense totals),
`income_trend` (monthly income), and `net_trend` (monthly income minus expenses).
`totals` contains exact `expenses`, `income`, and `net` sums for the chart data
table footer. `ranking_sum` and `ranking_average` cover only the displayed
top-ten category totals, never subtotal/detail rows together. Python sums exactly;
the category average divides by the displayed category count and rounds once
half-up away from zero to 18 decimal places (both ranking aggregates are zero
when no expense categories exist). These are decimal strings, not plot coordinates.
Charts cover the sorted union of currencies with expense or income activity:
an income-only currency has no ranking and an explicitly zero expense series.
Monthly expense and income coordinates share the same largest absolute magnitude,
so their grouped bars are comparable. Net coordinates use their own absolute
maximum and a visible zero baseline: positive means surplus, negative means deficit.
PostgreSQL computes net amounts exactly before Python supplies chart geometry;
negative expenses increase net income. No client-side monetary subtraction occurs.
All monthly series contain twelve chronological points, January through December,
including the current year. Months after the UTC cutoff contain zero due activity,
not forecasts. Future years have no currencies/charts.
The UI switches exclusively between grouped income/expenses and net-income bars.
Category rankings offer bar/donut views; donuts show shares of the displayed
categories only and are unavailable for negative totals or all-zero geometry.
Exact data, including the Sum/Average rows, remains available in either ranking view.

Each plot point has `key`, `label`, `amount` (an exact decimal string), and `value`
(an integer dimensionless coordinate from -10000 to 10000). Python computes coordinates
using exact rational arithmetic, relative to the chart's largest absolute magnitude, with only the
geometry rounded half-to-even. Very small nonzero amounts may have zero-width
bars. Coordinates are **not monetary values**: consumers label axes as relative
percentages and retain the original amounts in tooltips/data tables. Never turn
amount strings into JavaScript numbers.
Negative expenses remain signed in rankings, trends, comparisons, exact tables,
and tooltips. Signed plots use a diverging relative axis with a zero baseline;
positive-only plots retain their original scale. Rankings remain descending net
expense, not refund magnitude.

`POST /api/v1/summary/compare` is a private **read-only** request:

```json
{
  "kind": "month",
  "periods": [{"year": 2024, "month": 1}, {"year": 2024, "month": 2}]
}
```

`kind` is `month`, `year`, or `average`. Choose 2–6 distinct periods of the same
kind. Years are integers 1–9999; `month` is required as an integer 1–12 only for
month comparisons, and omitted/null otherwise. `average` requires `end_year`
(integer 1–9999) on each period, greater than or equal to `year` and no later
than the current UTC year. Other kinds omit/null `end_year`.
Unknown fields, duplicates, mixed period shapes, malformed values, future months/
years and future range endpoints return 422. Range identity includes both
endpoints; distinct ranges may overlap. Current periods are partial, never
forecasted. Owner fields are not accepted.

For yearly averages, for example:

```json
{
  "kind": "average",
  "periods": [{"year": 2022, "end_year": 2024}, {"year": 2019, "end_year": 2021}]
}
```

The response contains `kind`, `as_of`, ordered `periods`, and `currencies`.
Each period adds `key` (`p0` through `p5`), `label`, `months`, and `years`.
`month` and `end_year` are null when not applicable. `months` is 1 for month
comparisons, 12 for past years, or the current UTC month number for this year;
ranges count the calendar months from their first January through their final
December/current UTC month. `years` is the inclusive range length for averages,
otherwise 1. Labels identify ranges and yearly averages.
Each currency contains `totals` (one plot point per requested period) and
`categories` (`id`, current `name`, and ordered `points` for every period).
Only categories/currencies with activity in at least one selected period are
returned; genuinely absent cells are zero after a successful database read.
Categories are ranked by their maximum selected-period amount, then name/UUID.
All category series in a currency share one plot scale; currency totals use
their own scale. Currencies never mix.

`average` means **yearly** average: due expenses across the inclusive year range
divided by `end_year - year + 1`, including zero-expense years. A single-year
range divides by 1. The current year, when included, contributes only due expenses
and still counts as one year: no annualization, monthly denominator, or forecast.
This replaces the previous single-year monthly-average contract; clients must
supply `end_year` for averages. PostgreSQL rounds the exact ratio **once**, half-up to 18 decimal places,
using sign/absolute-magnitude numeric quotient/remainder arithmetic to avoid division's intermediate
rounding. Totals and categories are independently rounded and may differ by
rounding when added. Month/year sums remain exact and unrounded.
Negative halfway values round away from zero, matching positive half-up rounding.

One owner-scoped read-only grouping-sets statement evaluates every selected
period against the same due-occurrence snapshot. It uses the shared anchored
recurrence projection, excludes income/transfers/future entries, never provisions
users, and writes nothing. Authentication, no-store responses, explicit 503
failures, and server-side tokens match annual analysis.
See [the comparison sequence](IMPLEMENTATION_STATUS.md#expense-charts-and-period-comparisons).

## Categories

Categories are private to the verified subject. Both levels require closed
appearance fields for creation and full replacement:

```json
{
  "name": "Casa",
  "colour": "#3b82f6",
  "icon": "house"
}
```

`name` is trimmed, nonblank, and at most 100 characters. Main-category names
are unique per verified subject **and kind**; subcategory names are unique within their
owned parent. PostgreSQL compares `lower(btrim(name))`, so casing and surrounding
spaces do not distinguish names. Different users and different parents can
reuse names, as can income and expense roots; main/child names are independent. Duplicate creation or
replacement returns 409 with
`{"detail":"A category with this name already exists at this level. Choose a unique name."}`.
Replacing an item with its own name remains valid. Database unique indexes
enforce the rule for concurrent writes as well as normal API calls.
`colour` is a six-digit `#RRGGBB` hex string. Supported icons are `house`,
`heart-pulse`, `shopping-basket`, `utensils`, `train-front`, `shirt`, `gamepad-2`,
`gift`, `landmark`, `circle-ellipsis`, `plane`, `car`, `book-open`, and `coffee`.
Invalid values, owner identifiers, supplied hierarchy fields, and extra fields
return 422. IDs must be UUIDs.

Main-category inputs additionally accept `kind`: `expense` (default) or `income`.
Kind is immutable after creation; an attempted change returns 422
`Category type cannot be changed`. Income edits must retain `kind: "income"`.
Child inputs do not accept `kind`: their family comes from their owned parent.

The list response contains main categories with `id`, `name`, `colour`, `icon`,
`kind`, `preset_key` (null for custom categories), and a `subcategories` array. Each
subcategory has `id`, `name`, `colour`, and `icon`. Both levels are ordered by
name and UUID. Listing reads both tables in one repeatable-read snapshot and
does not provision users. Create/update responses contain the edited item's
`id`, `name`, `colour`, and `icon`.

There are exactly two levels: main categories and their immediate subcategories.
Separate database tables and a composite foreign key enforce this: a
subcategory's `(category_id, owner_subject)` must refer to a main category
belonging to the same user. A subcategory cannot be used as a parent.
Reparenting and deeper nesting are not supported. Missing, foreign-owned, and
wrong-parent identifiers return the same 404 `{"detail":"Category not found"}`.

Main-category deletion cascades to its own subcategories. Subcategory deletion
does not affect its parent or siblings. If a main category or subcategory is referenced by a transaction/series,
deletion returns 409 `{"detail":"Category is used by transactions"}` and changes
nothing, including its children. Reassign or delete those definitions first.
Foreign keys never cascade category deletion into financial history.
All reads and writes are private/no-store, and database failures
return 503 rather than fake empty lists or saved/deleted records. Creating a
main category or importing presets provisions a minimal user if needed without
overwriting account preferences or wallets.

### Optional predefined categories

The authenticated preset catalogue contains ten expense groups with 40 children
and five income groups with two children. Its authoritative
definition is [`category_presets.py`](../app/services/category_presets.py).
Children initially share their parent's colour/icon, but each saved copy can
be edited independently.

| Key             | Main category |
| --------------- | ------------- |
| `casa`          | Casa          |
| `salute`        | Salute        |
| `spesa`         | Spesa         |
| `cibo-fuori`    | CiboFuori     |
| `trasporti`     | Trasporti     |
| `abbigliamento` | Abbigliamento |
| `leisure`       | Leisure       |
| `regali`        | Regali        |
| `commissioni`   | Commissioni   |
| `altro`         | Altro         |
| `income-salary` | Salary (income) |
| `income-mealticket` | MealTicket (income) |
| `income-transfer` | Transfer (income) |
| `income-cash` | Cash (income) |
| `income-other` | Other (income; children `refund`, `private sell`) |

Preset roots expose `kind`; their children contain appearance fields only.
Income category **Transfer** is an income classification, not a wallet-to-wallet
transfer transaction. A refund may be recorded as income under Other/refund or
as a negative expense, but should not be recorded twice.

`POST /api/v1/categories/import` accepts `{"keys":["casa","leisure"]}`.
Select 1 to 15 valid keys. Only selected groups and their listed children are
copied, atomically, into the current user's records. No default categories are
assigned automatically during ordinary reads/writes, and no shared user-editable
category rows exist. Migration 010 seeds private income templates for owners
whose historical income needs reclassification; see the migration notes below.

The `(owner_subject, preset_key)` uniqueness constraint makes repeated or
concurrent imports idempotent. Existing groups, including custom categories with the same case-insensitive
name in the same family, are skipped without resetting
edited names/colours/icons, restoring deleted children, or adding duplicate
groups. `imported` counts only newly inserted main groups. After deleting an
entire imported main category, importing it again creates a fresh default copy.
CSV-created preset copies can contain only referenced children. Reimporting the
full preset does not fill missing children or overwrite that private copy.

### Category-family migration

Forward-only migration `010_category_kinds_signed_expenses.sql` preserves every
existing category as `expense`. For each owner with historical income, it creates
the five private income preset groups and Other's two children, then reassigns
those income definitions to income **Other**, clearing their old expense child.
Transaction IDs, amounts, dates, recurrence, wallets, and expense/transfer
classifications are unchanged. No transactions or existing categories are deleted.
The migration adds signed-amount and generated-family constraints transactionally.
