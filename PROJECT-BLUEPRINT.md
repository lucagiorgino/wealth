# Project blueprint

Wealth is a Python-first personal finance application. The current implementation
supports personal wallets and categorized transactions, not yet a complete tracker. See the [capability inventory and
diagrams](docs/IMPLEMENTATION_STATUS.md) for the implemented scope.

## Component boundaries

- **Next.js App Router** renders JavaScript/JSX pages on the server and uses
  registry-generated shadcn/ui components. Client components are limited to
  interactive behavior, such as dependent transaction selectors and mutation forms.
- **Auth0** owns user identity and credentials. Its Next.js SDK manages the
  encrypted browser session; its FastAPI SDK validates API access tokens.
- **FastAPI** is the authority for API identity, future business rules, and
  persistence. HTTP handlers live in `app/api/`, identity/configuration in
  `app/core/`, and PostgreSQL connectivity in `app/db/`.
- **PostgreSQL** stores users (verified external subjects and local profile
  preferences), their wallets, private categories/subcategories, and transaction
  definitions (including recurring series).
  `app/db/wallets.py` owns parameterized, owner-scoped queries.
  `app/schemas/wallets.py` owns closed request schemas and response models.
  `app/db/migrate.py` applies numbered SQL migrations in a transaction under a
  database advisory lock, recording each file in `schema_migrations`.

As business operations are introduced, put their logic in `app/services/`, not
in route handlers or the frontend. Add persistence behind `app/db/`; do not
let Next.js access PostgreSQL directly.

## Identity and trust boundaries

The browser gets a session cookie, not an API access token endpoint. The Next.js
server obtains access tokens from Auth0 and calls FastAPI with a bearer header.
API responses and identity requests are not cached; API redirects are rejected
to avoid forwarding credentials to another origin.

The official Next.js SDK renews tokens server-side before SSR, using a 60-second
expiry buffer and persisting rotated refresh tokens in encrypted HttpOnly cookies.
Missing/revoked credentials require login; provider/discovery/configuration
outages produce explicit private 503 responses, not login loops. Pages/actions
independently enforce sessions and handle typed renewal failures. See
[required Auth0 settings](frontend/README.md#automatic-token-renewal) and
[the renewal sequence](docs/IMPLEMENTATION_STATUS.md#token-renewal).

`GET /api/v1/me` exposes only the verified `sub` as `subject`. It does not create
a database user. Token signature/issuer/audience validation belongs to the Auth0
SDK; do not decode unverified claims as identity.

Missing Auth0 settings leave the landing page accessible but disable private
routes. An API request without a bearer token receives 401; one with a token
but no configured identity provider receives 503. There is no demo identity or
development authentication bypass.

Use the verified subject for future record ownership and enforce ownership in
the API/database queries, never from an owner ID supplied by the browser.
Wallet creation derives `owner_subject` exclusively from that verified subject.
The user's row is inserted on first profile/settings save, wallet/category creation, or
preset import. Wallet
creation inserts the row if absent in the same transaction as the wallet,
without overwriting saved profile preferences. Reads do not provision users.

## Application navigation

The authenticated landing dashboard lives at `/dashboard`; `/wallets` owns
wallet tables, creation, editing, protected deletion, and balances; `/transactions` manages paginated, filterable
income/expense/transfer transactions, `/categories` manages private categories and
subcategories, and `/account` manages local profile preferences.
`/summary` provides annual analysis; `/settings`, opened from the account menu,
manages saved light/dark appearance and the order of the five sidebar features.
These pages use a shared responsive sidebar with active
navigation and a bottom account menu (image/icon, saved name, optional session
email, management links, and sign-out). Account management is in that footer,
not the main navigation. Pages and server actions independently enforce
sessions, not just the layout. The wallets route uses URL-based page selection
and SSR requests for bounded, owner-scoped PostgreSQL pagination. See the
[navigation diagram](docs/IMPLEMENTATION_STATUS.md#application-navigation).

All application pages use a common token-based visual language and heading
hierarchy, with shadcn cards, dialogs, confirmations, and feedback. Desktop
navigation is a sticky rail; phones retain all destinations in a compact sticky
header. The dashboard provides task-oriented navigation, not invented analytics.
The shared visual system uses global shadcn preset `b2CjxkLGi` (Radix Mira,
Mist/Emerald, Lucide, IBM Plex Sans with inherited headings). Root theme tokens
and shared primitives own typography, role-based corners, controls, dialog
titles and overlays; pages do not configure separate presets. Amounts inherit
the global font with tabular numerals. Next.js downloads the
font at build/development-compile time and self-hosts it; no browser font-provider
request is introduced. Application-specific semantic status colours, readable
dark primary ink and centrally defined 44-pixel interaction targets remain in place. See the
[frontend styling guide](frontend/README.md#interface-and-page-structure).
Wallet creation and transaction editing use focused dialogs whose local input
state survives refusal; transaction deletion uses a retryable alert dialog.
Wallet create/edit forms pair a keyboard slider with unrestricted exact amount
entry and use category-style radio tiles for icon selection. They offer six
currency choices and a bank/trading/exchange type. These types do not connect to
external financial providers. See [the wallet contract](docs/API.md#wallets).

Wallet custom favicons use an explicit public HTTPS URL rather than profile
uploads. The wallet service downloads through an address-pinned, TLS-verified
connection with private-address/redirect refusal and bounded size/time, then
reuses the image normalizer (also accepting ICO for wallets). Migration 011 adds
the type and normalized PNG bytes without rewriting existing financial data.
URLs and originals are not persisted; private responses embed the stored image
as a PNG data URL. Subsequent page loads never contact the source image host.
Profile images retain their binary-upload-only contract. Server/session/API
boundaries and exact decimal strings are unchanged; no runtime library was added.
URL edits also trigger a debounced, independently session-checked preview action.
Its authenticated API endpoint reuses the same download/normalization service,
returns only a private PNG data URL, and never accesses the database. The form
ignores stale/closed-dialog responses and shows loading or explicit errors;
only an explicit wallet save persists an image.

## Workspace settings

Migration 012 adds `theme` and a complete `sidebar_order` permutation to users.
The settings API derives ownership from the verified subject; successful reads
of absent rows return light/default order without provisioning. A settings save
atomically upserts only preference columns, preserving names, images and financial
records. Schema and SQL constraints reject invalid themes, missing features,
duplicates and unknown IDs. See [the HTTP contract](docs/API.md#workspace-settings).

Next.js renders the saved theme on the root `<html>` element, so initial HTML,
body-portaled dialogs and native controls share the same appearance. Authenticated
settings reads are deduplicated only within each server render, never cached
across requests/users. The private shell consumes the saved order for both
desktop and mobile. Every settings page/action independently checks the session;
public visitors without sessions do not fetch preferences. Successful saves
revalidate the root layout; refusals preserve form edits and leave the active
theme/navigation unchanged. Read failures are explicitly announced with default
shell appearance/navigation and no editable settings form, not fake successful
preferences. No browser storage or direct frontend database access is added.

## Account profiles

Wealth stores an optional display name, supported profile icon, and optional
normalized PNG image on the
verified-subject user row. The name is unset until saved, and the icon defaults
to `user-round`. `GET`/`PUT /api/v1/account` always derive the target user from
the verified subject. Initial defaults are returned only after a successful
database read, not on connection errors. Profile saves atomically upsert only
the name/icon and preserve images and wallets. Auth0 remains the authority for identity,
credentials, and provider account settings; no provider-management token or
profile synchronization is introduced. See [the API reference](docs/API.md#account-management).

The account page treats icons and uploads as alternative profile pictures, using
one selector and preview. Name-only saves use `PATCH /api/v1/account` and preserve
the active picture. Selecting an existing icon uses `PUT /api/v1/account/icon`,
atomically setting the icon and clearing the custom image while preserving the
name and financial records. The legacy name/icon PUT remains supported.

The private layout independently reads the session and profile server-side for
its footer. Only the email string is taken from the SDK session, and it is not
stored in PostgreSQL or editable as a Wealth preference. Missing email displays
"Wealth account", not an invented email. Database/API errors show an explicit
profile-unavailable state while keeping account and sign-out actions accessible.
Profile changes revalidate the private layout so the footer and dashboard stay
synchronized.

Custom images arrive at an authenticated binary endpoint. The API bounds the
stream to 2 MiB; `app/services/profile_images.py` uses Pillow in a worker thread
to validate PNG/JPEG/WebP content, MIME agreement, static frames, and dimensions
up to 4096 pixels per side. It applies orientation, downsizes to at most 256 pixels,
and creates a fresh metadata-free PNG. Only normalized bytes are persisted in
`users.avatar_png`, with a database size/signature check. Original files,
filenames, external URLs, and metadata are not stored. Account responses embed
a private PNG data URL, so no public image endpoint, browser bearer token, object
store, or remote-image fetch is introduced. Removing the image restores the
selected icon without deleting other profile preferences.

## Wallet persistence

A user can own zero or more wallets. Each wallet has a UUID, name, six-digit hex
colour, a supported Lucide icon identifier, a supported currency code (default EUR),
an exact PostgreSQL `numeric` initial amount, and creation timestamp.
Both the API and database default the amount to
zero. Negative amounts are accepted. Names need not be unique.

Amounts travel as decimal strings (or integer JSON inputs), never floating-point
JSON inputs or JavaScript `Number` conversions. No currency rounding or conversion
is performed. Current amounts are computed in a read-only owner-scoped snapshot:
initial amount plus due income minus due expenses, plus incoming transfers minus
outgoing transfers. The UTC horizon and anchored occurrence SQL are shared with
transaction history; even the first future entry is excluded from balances.
Only the requested wallet page's related definitions are projected.
Balances are never stored. Initial amounts change only through explicit wallet edits.
Owned wallet updates/deletes lock the row and refuse foreign/missing IDs identically.
Referenced wallets refuse deletion and currency changes without removing history.
Same-currency transfer writes and import confirmation share-lock wallet currencies
against concurrent edits; exchange-rate conversion remains planned.

The [Mermaid ER diagram](docs/IMPLEMENTATION_STATUS.md#application-data-model)
reflects actual table/column names and relationships. API contracts and limits
belong in [the API reference](docs/API.md#wallets).

## Category hierarchy and templates

Main categories live in `categories` and children in `subcategories`, each with
a name, hex colour, and supported icon. The child table's composite foreign key
references `(categories.id, categories.owner_subject)`, so only an owned main
category can be a parent. The schema cannot represent a third level or a
cross-user parent. Every list/mutation filters by verified subject; no form
owner identifier is trusted.

Main categories have immutable `expense`/`income` families; children inherit their
parent's family. Main-category names are unique per owner and family, and subcategory names per owned parent,
using database unique indexes on `lower(btrim(name))`. Creation/replacement
conflicts return 409 without changing stored records. Migration 008 keeps all
IDs and transaction references, retaining the oldest duplicate name and adding
collision-safe numbered suffixes to later duplicates within the 100-character
limit. No categories or transactions are merged or deleted.

CSV reference resolution checks the read-only predefined catalogue after
exact owned-name/UUID matches. It reuses renamed owned copies by preset key or
proposes a private copy with canonical preset appearance and provenance.
Approval and final atomic confirmation remain required; only referenced
children are copied. See [CSV reference rules](docs/API.md#reviewed-csv-transaction-imports).

Predefined categories are read-only application templates in
`app/services/category_presets.py`. An explicit selection copies whole groups
into private records in one transaction. Per-owner preset keys make repeated
imports idempotent without resetting customizations. Preset groups whose names
already match an owned category are also skipped. Users can independently edit,
add, or delete both levels. Deleting a parent cascades to its children.
Referenced categories/subcategories cannot be deleted until their transactions
are reassigned or deleted. There is no shared mutable user category, automatic
assignment, or reparenting. See [the API reference](docs/API.md#categories)
and [Mermaid model](docs/IMPLEMENTATION_STATUS.md#application-data-model).

Income templates are Salary, MealTicket, Transfer, Cash, and Other (children:
refund, private sell). Actual wallet transfers continue using expense categories,
not the income category named Transfer. CSV name/UUID/preset resolution and
proposals are family-specific; wrong-family UUIDs remain row errors.
Migration 010 keeps existing categories as expenses, seeds the income templates
for owners with historical income, and reassigns only those income definitions
to income Other with no child. Money, IDs, dates, recurrence, and wallet movement
are unchanged. Other users explicitly import templates; reads never provision.

The SSR Categories page supplies owned records to a shadcn card workspace.
Name search and tree expansion run locally; editor dialogs, deletion alerts,
and the optional preset sheet submit only through independently authenticated
server actions. No category client component accesses the database or receives
API tokens. See the [frontend guide](frontend/README.md) for interaction details.

## Transactions and recurring series

CSV imports use the existing transaction model and a separate retry-receipt
table, not staged financial records. A bounded authenticated raw upload is parsed
by Python, with header aliases providing initial mappings. The client keeps the
preview in component state, offers mapping/defaults, format controls,
row corrections/exclusion, and explicit approval; every upload/validate/confirm Server Action checks its
session independently. Validation reads owned references without provisioning.
Validation proposes deduplicated missing named wallets/categories/subcategories.
A separate recap must be approved before transaction review, but still performs
no writes. Python normalizes recognized currency-marked exact decimals and
supported calendar dates; ambiguous date order/decimal grouping has explicit
controls, and invalid symbols/dates remain row errors. Recognition does not
assign wallet currency or introduce conversion. CSV-created wallets default to EUR;
amounts use the selected wallet's denomination.
Confirmation serializes CSV reference creation per subject and revalidates
references and approval, then inserts approved missing records, all selected
definitions, and a subject-scoped hash/count receipt atomically. The receipt
prevents concurrent/repeated confirmation from duplicating entries; neither raw
files nor preview data are retained by the server. Discard before confirmation
only clears client state, even after recap approval. Existing schema tables
support these creations; no additional migration is required. See the
[import contract](docs/API.md#reviewed-csv-transaction-imports) and
[sequence](docs/IMPLEMENTATION_STATUS.md#csv-transaction-import).

`transactions` stores an owned single transaction or recurring series definition:
optional description (stored as an empty string when omitted/blank), nonzero exact amount, original date, type, owned source wallet,
transfer destination, main category, optional subcategory, recurrence frequency,
optional total occurrence count, and persistent `is_pinned` preference. Income uses the source-wallet field as its
receiving wallet. Transfers are one record referencing two distinct wallets,
not two independently editable transactions. Composite foreign keys enforce all
ownership, parent/category relationships, and transaction/category family through
a generated `category_kind`. Expenses alone may be negative; they reduce spending
and increase the source balance without becoming income. Zero remains invalid;
income and transfers remain positive. Wallet initial amounts remain
unchanged; read-only wallet balances include due movements. Currency conversion is not implemented.

Transaction history is displayed as semantic shadcn tables grouped by occurrence
month on the current server-paginated page, with a leading pinned section.
Wallet icons lead compact rows, followed by description/categories, date, type,
exact signed amount and a three-dot action menu. Existing month navigation/filtering
remains, and All dates shows distinct month sections. The API orders occurrences
by pin status then date descending before pagination; the frontend preserves that order without
local sorting or fetching unpaginated history. Horizontal scrolling and sticky
actions keep the table usable on narrow screens. Amounts show a currency symbol
without number conversion or rounding. A selected monthly table omits its
redundant month heading; All dates retains month group headings.

Page-scoped checkboxes select unique definitions, synchronizing repeated series
occurrences. Bulk partial editing, confirmed deletion and pin/unpin use
independently session-checked actions and private bounded APIs. The transaction
service locks all selected owned definitions, validates each merged full input,
and commits all changes/deletions together or rolls everything back. Missing or
foreign selections never partially succeed. Editing/deletion/pinning affects
whole series; pins alter ordering only, never amounts or aggregate scope.
Migration `013_transaction_pins.sql` adds the default-false preference.

The listing response includes whole-filter exact totals by currency for income,
expenses, transfers, and income minus expenses (excluding transfers), plus
source-wallet expense totals. PostgreSQL aggregates a materialized filtered
occurrence projection before pagination, with summary/count/page sharing a
read-only snapshot. The frontend never fetches all financial rows or recomputes
money totals. Different currencies are never combined. A shadcn Collapsible
keeps the wallet breakdown closed by default.
Summaries follow history's first-future-entry scope, not current wallet balances.
No aggregate table or migration is introduced.

The service fixes a UTC `as_of` date for each listing. Owner-scoped PostgreSQL
queries project due occurrences from the saved definitions, then filter, count,
order, and paginate them in one read-only repeatable-read snapshot. No background
worker, duplicate insertion, or visit-triggered write is needed. A future initial
entry is visible immediately; future repetitions become visible when due.
Weekly repeats advance seven days; monthly/yearly repeats derive from the
original date and clamp to shorter months without drifting.

An occurrence is identified by its definition UUID and one-based occurrence
number. Edit/delete targets the definition, affecting the entire series,
including history; the UI states and confirms this scope. Individual occurrence
exceptions, pause/resume, currency conversion, and asset tracking remain planned.

The SSR transaction workspace defaults to the current UTC month. Shadcn search
popover, filter sheet, separate year picker/arrows, resize-aware twelve-month rail,
summary, empty state, and toolbar creation dialog keep
the list uncluttered. URL month selection is translated to existing inclusive
API date filters; All dates and custom ranges retain access to older entries.
Year/month changes preserve search/reference filters and reset pagination. Successful
creation closes the dialog and selects the saved month (or retains All dates);
failed saves preserve the open form. No API contract or database schema change
is needed for this navigation. See the [frontend guide](frontend/README.md).
See [the API contract](docs/API.md#transactions) and
[interaction diagrams](docs/IMPLEMENTATION_STATUS.md#transaction-management).

### Annual expense analysis

The private SSR `/summary?year=N` page adds year navigation and per-currency
monthly/yearly expense tables followed by income tables, with two-level category detail, expandable
subcategories, and hideable category subtotals. Semantic shadcn tables keep their
first column/month headers visible inside a named keyboard-scrollable region.
The frontend displays exact amounts and never queries persistence or computes
money totals.

`/api/v1/summary` verifies identity and a bounded year. The service fixes today's
UTC cutoff; persistence reuses anchored occurrence SQL and computes all twelve
monthly sums, annual sums, category/subcategory rollups, and currency grand totals
in one owned read-only grouping-sets query. Direct-main-category expenses remain
an explicit nonpersisted bucket. Only due expenses enter the selected year's
totals; income, transfers, and first future entries are excluded. Distinct
currencies are not converted/combined. No aggregate state or migration is added.
Empty reads do not create users; refusals remain explicit.
The analysis endpoint includes separate expense/income hierarchies and exact
monthly income-minus-expenses values from one owned grouping-sets snapshot.
Transfers and future occurrences remain excluded; income-only currencies are
retained. The original annual endpoint still returns expense totals only.
Shadcn monthly view controls switch exclusively between grouped expense/income
bars on a shared scale and diverging monthly net bars. January-December chart
tables include backend-computed exact totals, including zero due activity after
the current-year cutoff. Expense-category ranking switches between bars and
nonnegative donut shares of the displayed categories; signed totals retain bars.
Python also supplies exact displayed-ranking sums and category averages rounded
once half-up to 18 places. These presentation aggregates do not change persistence.
Python's exact rational arithmetic supplies
signed dimensionless geometry normalized by the greatest absolute magnitude,
while amounts remain decimal strings in the shadcn/
Recharts client. Accessible exact-data tables complement relative-scale charts.
Negative expenses use diverging axes with zero baselines; positive-only charts
retain their original presentation. Signed averages round half-up away from zero.

An independently authenticated read-only comparison action accepts 2–6 same-kind
months, years, or yearly averages over inclusive year ranges. A separate single grouping-sets query
evaluates all selected periods against one owned, due-only occurrence snapshot.
PostgreSQL computes exact sums and once-rounded 18-place yearly averages,
including zero-spend calendar years. Range endpoints cannot be in a future year;
an included current year is partial, counts as one year, and is not annualized.
The service aligns absent cells only after a successful read and supplies shared
per-currency category geometry. Grouped bars, numbered legends, and full exact
tables preserve comparability without monetary arithmetic in JavaScript.
Edits and previous labelled results survive explicit comparison failures.
See [the API contract](docs/API.md#annual-expense-analysis) and
[sequence](docs/IMPLEMENTATION_STATUS.md#annual-expense-analysis).

## Local runtime

The base Compose configuration runs PostgreSQL, a one-shot migration service,
the API, and a standalone Next.js server. `make local-dev-up` layers
`compose.dev.yaml` over it: source bind mounts feed Uvicorn reload and Next.js
Fast Refresh, with container-only frontend dependency/build volumes.
Both modes use the same services, database volume, and Auth0 origins; the API
starts only after migrations complete. Live reload does not apply migrations
or install changed dependencies. See the [runbook](docs/RUNBOOK.md#live-development).
Ports bind only
to loopback: 5432, 8000, and 3000 respectively. The frontend calls
`http://backend:8000` over the Compose network; the browser uses
`http://localhost:3000`.

The server-side adapter permits HTTP only for named local origins in explicit
`APP_ENV=development`; other API origins require HTTPS. The local Compose stack
is not a production deployment template. A deployment needs HTTPS ingress,
externally managed secrets, database access controls/backups, and matching Auth0
callback/logout origins. The deployment diagram is a target boundary view, not
an implemented cloud configuration.

Tests use a separate ephemeral PostgreSQL service, not the development volume.
`/health` is process liveness; `/ready` checks PostgreSQL, not Auth0 readiness.

## Documentation ownership

Keep HTTP contracts in [API](docs/API.md), commands and recovery in the
[runbook](docs/RUNBOOK.md), and Auth0/SSR details in the
[frontend guide](frontend/README.md). Maintain the component/development/target
deployment diagrams and operation sequence index in
[implementation status](docs/IMPLEMENTATION_STATUS.md).
Link to these canonical explanations rather than duplicating them.
