# Runbook

## Local setup

Requires Docker and Docker Compose 2.24+ (`env_file.required` is used). Native
validation optionally uses Python 3.11+ and Node.js 22.13+ or 24+ with npm.

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env.local
```

Configure Auth0 as described in the [frontend guide](../frontend/README.md).
Root `.env` belongs to the API/PostgreSQL; the frontend uses its own
`frontend/.env.local`. No credentials are required just to view the setup page.

The example PostgreSQL password is for local development only. If changing it,
use a URL-safe value (for example hex) and update the native `DATABASE_URL` too.
Compose replaces the backend connection URL with its internal PostgreSQL
hostname. Credentials in PostgreSQL's persisted volume are initialized only
once: changing `.env` does not rotate an existing database password.

```bash
make compose-config
make local-dev-up
make compose-ps
```

| Component                         | Host URL                                                       |
| --------------------------------- | -------------------------------------------------------------- |
| Frontend                          | `http://localhost:3000`                                        |
| API / OpenAPI UI                  | `http://localhost:8000` / `http://localhost:8000/docs`         |
| API liveness / database readiness | `http://localhost:8000/health` / `http://localhost:8000/ready` |
| PostgreSQL                        | `localhost:5432`                                               |

After sign-in, `/dashboard` is the landing page. Use its sidebar to open
`/wallets`, which lists ten owned wallets per page in a table with EUR-default
currency, initial amounts, computed current amounts, and edit/delete actions.
Balances include income, expenses, and both directions of transfers due through
today UTC, including recurring occurrences; future entries are excluded.
Referenced wallets cannot be deleted or change currency. Transfers require the
same currency; conversion is not implemented.
Wallet creation/editing offers bank/trading/exchange types, six currency choices,
an initial-amount slider with exact text entry, and icon tiles with optional
downloaded favicons. Apply migration 011 with `make migrate` before using these
fields. Automatic favicon previews and saves require backend DNS and outbound HTTPS access to
the selected public image host; private destinations and redirects are refused.
Stored images need no outbound access on later reads. See
[favicon limits and errors](API.md#custom-wallet-favicons).
Previous/Next links preserve page selection in the URL.
Open the bottom sidebar profile menu for **Manage account** or **Sign out**.
`/account` edits the Wealth display name and profile picture, chosen from an
existing icon or a custom image; it does not change Auth0 credentials or provider settings.
Use `/categories` to select optional predefined groups or create your own
two-level categories. Main-category deletion also deletes its subcategories;
the interface asks for confirmation.
Use `/transactions` to add, filter, page through, edit, and delete income,
expenses, transfers, and recurring series. Create wallets/categories first.
The page opens the current UTC month. Use the separate year arrows/picker and
January-December month rail to browse,
the search icon for descriptions, and the filter icon for advanced filters.
**Transaction options > All dates** shows the full history; custom date bounds
are available under that period in the filter sheet. The toolbar Add button
opens the creation dialog. Saving selects the entry's month (or retains All
dates); errors keep the dialog and edits intact.
Referenced categories cannot be deleted; reassign/delete their transactions
first. Recurring edits/deletions affect the entire series, including history.
The summary above history shows filtered income/expense/transfer totals and net
income (income minus expenses, excluding transfers) across every page.
Currency symbols accompany exact values; currencies are listed separately.
Expand **Expenses by wallet** for source-wallet expense totals; it starts closed.
Summaries use history's occurrence scope, including matching future initial entries,
not wallet current balances. No migration, dependency change, or service restart
is required for this overview.
**Import CSV** opens upload, field/format mapping, any missing-record approval
recap, and row review. Approve proposed wallet/category/subcategory names before
reviewing transactions; creation happens only at final confirmation.
Descriptions are optional in manual transactions and imports; other required
fields still produce row alerts.
Recognized currency symbols and dot/comma decimals are normalized exactly;
calendar dates become ISO dates. Choose decimal separator/date order if ambiguous.
Correct or discard invalid rows, revalidate changes, then explicitly confirm.
Discarding before confirmation saves nothing, including approved new records.
CSVs use UTF-8 and are limited to 512 KiB/500 data records; see the
[import contract](API.md#reviewed-csv-transaction-imports). Interrupted confirmations
must be retried unchanged to retrieve the receipt without duplicating transactions.

The frontend's `BACKEND_API_URL` is server-side and must be an origin with no API
path. Compose sets it to `http://backend:8000`. Do not expose it or Auth0 secrets
using `NEXT_PUBLIC_*`.

### Live development

Run `make local-dev-up` once, then leave the services running while editing.
It combines `compose.yaml` with `compose.dev.yaml` in the same Compose project,
switching existing application containers to development mode without removing
the PostgreSQL data volume. URLs and Auth0 callbacks stay the same.

The API bind-mounts `app/` read-only and runs Uvicorn with `--reload`. The
frontend bind-mounts `frontend/` and runs `next dev` with Fast Refresh. Refresh
the browser after backend changes to fetch updated SSR data; frontend changes
usually appear automatically. Python syntax errors or frontend compilation
errors must be corrected before the affected service can serve requests again.

Frontend dependencies and `.next` output use container-only anonymous volumes,
so host `node_modules` and native build output do not interfere. The development
target renews those volumes when recreating containers, picking up dependencies
from the rebuilt image. No host Python/Node installation is needed.

| Change                                                              | Action                                                          |
| ------------------------------------------------------------------- | --------------------------------------------------------------- |
| Python, JSX, JavaScript, or CSS source                              | Save, then refresh; no Make command needed                      |
| Python dependencies or `frontend/package.json`/lockfile             | Update the manifest/lockfile, then rerun `make local-dev-up`    |
| Root `.env`, `frontend/.env.local`, Dockerfile, or Compose settings | Rerun `make local-dev-up` to rebuild/recreate affected services |
| New SQL migration                                                   | Run `make migrate` before exercising code that requires it      |

Migrations are not automatically applied by Python reload. Both startup modes
still run pending migrations before the API starts. Use `make compose-logs` to
inspect reload/compilation failures. `make local-apps-stop` stops either mode
without stopping PostgreSQL; `make local-dev-up` resumes development.

For production-mode local validation, run `make local-containers-up`. It switches
the same application services back to immutable production builds without
deleting PostgreSQL data; source changes then require another image build.
The test targets always use isolated production/test images, not the live
development bind mounts. Development servers are loopback-only local tooling,
not a deployment configuration.

## Database migrations

`make local-dev-up` and `make local-containers-up` run the one-shot `migrate`
service after PostgreSQL is healthy and before starting the API. Apply pending
migrations explicitly with `make migrate`; native execution uses
`.venv/bin/python -m app.db.migrate`.
Use the intended `DATABASE_URL` and take backups before any non-local change.

Migrations live in `app/db/migrations/` and are bundled with the Python package.
The runner takes a transaction-scoped PostgreSQL advisory lock, applies pending
SQL files in filename order, and records them in `schema_migrations`. Failures
roll back the transaction and stop startup. Rerunning skips recorded versions.
Do not edit applied migrations or reset databases on startup; add a new
forward-only SQL file instead. There is no automatic downgrade command.

`001_wallets.sql` creates minimal external-subject users and their wallets.
`002_account_profile.sql` adds the nullable display name and default profile
icon to users without replacing existing rows or wallets.
`003_categories.sql` adds owner-scoped main categories and subcategories.
It does not assign presets or modify existing wallets/account preferences.
`004_transactions.sql` adds transaction/recurring-series definitions, exact
positive amounts, recurrence/transfer constraints, composite ownership and
subcategory-parent foreign keys, and lookup indexes. It preserves existing data;
referenced categories cannot be deleted. Apply it with `make migrate` to an
already-running development stack; no application rebuild/restart is necessary.
Keep the [ER diagram](IMPLEMENTATION_STATUS.md#application-data-model) aligned
with changes.

`005_account_avatar.sql` adds the nullable `users.avatar_png` byte column with
PNG-signature and 320 KiB storage checks, without changing existing preferences
or financial records. The image feature adds Pillow to Python dependencies:
run `make local-dev-up` once to refresh the application image and apply pending
migrations; subsequent image imports need no rebuild.

`008_unique_category_names.sql` adds case-insensitive main-category uniqueness
per owner and subcategory uniqueness per parent. It takes transactional table
locks, preserves the oldest name (creation timestamp, then UUID), and renames
later duplicates with numbered suffixes, skipping suffixes already in use and
truncating only the duplicate's base name to fit 100 characters. It preserves
IDs, parent links, styling, preset keys, and every transaction reference.
No rows are merged or deleted. Review category labels after applying it.
Apply with `make migrate`; running reload-enabled applications need no restart.

`009_wallet_currency.sql` adds a required supported currency code with EUR
default and a matching check constraint. Existing wallets receive EUR without
changing their initial amounts, IDs, or transaction references. No balance column
is added: balances are calculated from due transaction occurrences on reads.
Apply with `make migrate`; no dependency change or application restart is needed.

`012_user_preferences.sql` adds the user's light-default theme and the default
five-feature sidebar order, with checks for the two themes and a complete,
unique feature permutation. It preserves profiles/images and all financial
records. Apply it with `make migrate` before using **Account menu > Settings**.
No new environment variables, dependencies or development-service restart are
needed. See [the settings contract](API.md#workspace-settings).

### Profile image imports

Under **Account > Profile picture**, select **Custom image (upload)**, choose a
PNG, JPEG, or WebP, inspect the preview, and select **Save profile picture**.
Limits are 2 MiB and 4096 pixels per side; animations
and SVG/GIF are unsupported. The API validates actual content, removes metadata,
and saves a PNG at most 256 pixels per side. Failed imports retain the previous
image and selected file for retry; invalid client-side file choices show errors.
The single **Profile picture** selector offers existing icons or a custom upload
with one preview. Choose an icon and **Save profile picture** to replace a custom
image; there is no separate removal button. Name saves do not change the picture.
Successful changes refresh the shared sidebar and dashboard.

Images are private bytes in the existing PostgreSQL volume and follow its
backup/restore policy. No object storage, filesystem upload volume, public asset
URL, or additional service is required. Do not log upload bodies or profile image
data URLs. A missing session email simply displays "Wealth account" in the footer.

### Recurring transactions

No scheduler or worker needs starting. Listing calculates occurrences due through
today (UTC) directly from persisted definitions, so downtime does not lose repeats
or require catch-up writes. Refresh to see newly due occurrences. A future start
date is visible once; later repeats appear only when due. Counts include the
first occurrence, and blank counts mean indefinitely. Monthly/yearly calculation
uses the original day with month-end clamping. See
[transaction contracts](API.md#transactions) for edit/delete scope and filters.

### Transaction selection and pins

Apply `013_transaction_pins.sql` with `make migrate` before using the updated
transaction list. It adds a nonnullable default-false pin without changing
existing financial fields; no dependencies, worker or new settings are required.
Leave the live development services running.

Use the three-dot row menu for editing, pinning/unpinning and confirmed deletion.
Checkboxes select unique series on the current page, not every filtered result.
Bulk editing changes only checked fields. All selected series must accept the
changes or nothing is saved; errors preserve edits/selection for retry.
Deletion and changes affect every occurrence of each selected series.
Pins persist and sort matching entries first without changing totals or filters.
See [the API contract](API.md#bulk-updates-deletion-and-pins).

## Tests and checks

The frontend's global `b2CjxkLGi` shadcn preset uses self-hosted IBM Plex Sans through
`next/font/google`. Production builds and the first development compilation
need outbound HTTPS access to Google's font CSS/assets. A font download failure
is a build/compilation error, not a reason to silently replace the requested
font. Browsers load only Wealth-hosted font assets. See the
[frontend styling guide](../frontend/README.md#interface-and-page-structure).

All primary Make validation targets run in Docker:

```bash
make test
make test TEST_ARGS=tests/test_identity.py::test_identity_preserves_sdk_rejection
make test TEST_ARGS='-m integration'
make test TEST_ARGS=tests/test_wallets.py::test_multiple_wallets_are_persisted_and_isolated_by_owner
make lint
make format-check
make frontend-test
make frontend-test FRONTEND_TEST_ARGS='--test-name-pattern=refusal tests/api-client.test.js'
make frontend-lint
make frontend-build
make frontend-test-browser
make frontend-test-browser BROWSER_TEST_ARGS=tests/browser/bootstrap.spec.js
make check
```

The backend test service uses `postgres-test`, a dedicated tmpfs database with
test-only credentials and no published port. Integration tests require an
explicit `TEST_DATABASE_URL`; Compose supplies it. Do not point that variable at
a development or production database. Without it, the PostgreSQL integration
tests are skipped. Wallet integration tests apply migrations and use unique
synthetic subjects, deleting only their own records afterward. Account tests
also verify initial defaults, read-only provisioning behavior, profile updates,
cross-user isolation, migration repeatability, and preservation of wallets.
Image tests additionally cover binary upload limits (including chunked requests),
format/decoder refusals, metadata removal, normalization, private persistence,
removal, and preservation of names/icons/wallets. Browser account tests cover
the footer's desktop placement, keyboard menu, image preview/import/refusal/retry,
layout/dashboard synchronization, removal, and mobile menu/overflow.
Category tests verify all requested preset names/grouping, selected imports,
idempotence after customization, CRUD ownership, cascades, and database-level
rejection of third-level or foreign-owned parents.
Transaction tests cover exact amounts, complete CRUD, transfer/reference
ownership, protected category deletion, filtered pagination, finite/indefinite
recurrence, month ends, leap years, future starts, and direct database constraints.
The transaction Chromium test uses an isolated mock dataset/token and checks
dependent selectors, precision, failed-save retention, URL filters/pagination,
series edits, deletion confirmation/cancellation, and mobile overflow.
Bulk tests additionally cover bounded/closed payloads, ownership and missing-ID
atomic refusals, mid-batch rollback, exact partial changes, series-wide pins,
pin-first pagination and unchanged totals. The dedicated browser workflow covers
mixed-type refusal, preserved edits/selection after outages, synchronized recurring
checkboxes, page resets, pin persistence and confirmed whole-series deletion.

Frontend unit tests use Node's test runner. Playwright starts an unconfigured
production server on port 3100 for private-route refusal, plus a configured
server on 3101 with a loopback mock API on 3102 for wallet form/list interactions.
The wallet browser test uses the Auth0 SDK's public `generateSessionCookie`
testing utility with a synthetic session and test-only key, not an application
authentication bypass. It covers sidebar navigation on desktop/mobile, URL-based
pagination, page errors/recovery, multiple wallets, the zero default, exact
decimal strings, colour/icon rendering, and form validation. The account browser
test covers persisted display names/icons, dashboard updates, and retaining
edits after failed validation or a refused save. The category browser test covers
opt-in presets, custom categories, editing both levels, refused-save retry,
persisted colours/icons, confirmation/cancellation, and mobile navigation.
Real provider login
and real persistence are not exercised by that mock-backed browser test;
PostgreSQL-backed API tests cover persistence, pagination, and owner isolation.

### Browser suite isolation

The full browser suite includes existing wallet/category workflows that share
one mock owner. Run them serially to avoid cross-test fixture interference:

```bash
make frontend-test-browser BROWSER_TEST_ARGS='--workers=1'
```

Individual selectors can still use the default worker configuration.

### Optional native validation

When Docker is unavailable, install the declared dependencies first:

```bash
make install
make frontend-install
.venv/bin/python -m pytest -q
.venv/bin/python -m pytest -q tests/test_identity.py::test_identity_preserves_sdk_rejection
.venv/bin/ruff check app tests
.venv/bin/ruff format --check app tests
npm --prefix frontend test
npm --prefix frontend run test:single -- --test-name-pattern=refusal tests/api-client.test.js
npm --prefix frontend run lint
npm --prefix frontend run format:check
npm --prefix frontend run build
cd frontend
npx playwright install chromium
npm run test:e2e -- tests/browser/bootstrap.spec.js
```

For the database-backed check, provision a dedicated PostgreSQL database and set
`TEST_DATABASE_URL` before invoking pytest. Native unit tests/builds do not
substitute for validating Compose images and PostgreSQL connectivity.

Native API execution uses `.venv/bin/python -m app`; native frontend development
uses `npm --prefix frontend run dev`. Ensure native `DATABASE_URL` uses
`localhost`, set `APP_ENV=development` in the frontend environment, and stop
application containers first to avoid port conflicts. A database must be running
for `/ready`; `/health` is independent of it.
Apply migrations before starting a native API that serves wallet requests.

## Annual expense analysis

### Signed expenses and category families

Expenses accept negative nonzero amounts in forms, edits, recurring series, and
CSV imports. A negative expense reduces spending totals and increases its source
wallet balance; zero is still invalid, and income/transfers remain positive.
Summary tables/averages remain signed; negative chart coordinates use diverging
axes and a visible zero baseline.

In **Categories**, select the income family and import Salary, MealTicket,
Transfer, Cash, or Other (refund, private sell) through the existing optional
preset workflow. Transaction selectors switch families with type and clear stale
choices. Expense and actual wallet-transfer transactions use expense categories;
income uses only income categories. The income category Transfer is not a
wallet-transfer operation.

Apply migration 010 with `make migrate` before using the updated source against
an existing database. Back up important data before migrations as usual.
Existing categories stay expense categories. Historical income definitions move
to a newly seeded private income **Other**, with their old expense subcategory
cleared; amounts, dates, IDs, recurrence, and balances remain unchanged. Owners
with historical income receive all five income presets and Other's children.
Other/new owners import the desired income presets explicitly.
No teardown, dependency reinstall, or development service rebuild is needed.

Open **Summary** in the private navigation. Use year arrows or the year picker
to select a calendar year. Expense tables are followed by income tables, showing monthly and annual totals for
categories and their subcategories, separately for each wallet currency.
Expand/collapse categories individually or together; uncheck **Show category
totals** to hide the subtotals while retaining details and the grand totals.
Expenses without a selected child appear under **Without subcategory**.

Totals cover each family's entries due through today's UTC date. Past years cover the
whole year, the current year is year-to-date, and future years are empty.
Transfers and forecasted recurring entries do not contribute.
Scroll inside the table to reveal all months; totals preserve exact precision.
Refresh to see newly due occurrences. Transaction/import and category mutations
refresh the relevant Summary data after success.

Use **Monthly chart view** above the tables to switch between grouped monthly
expenses/income and monthly net income (income minus expenses); only one is
shown at a time. Chart data tables always include January-December and a
**Totals** footer; months beyond today's cutoff contain zero due activity.
The two compact chart cards sit side by side on wide screens and stack on mobile.
Like the monthly selector, **Category chart view** offers **Bar chart / Donut chart**.
Donuts show
only the displayed categories' shares and are disabled for signed totals or
all-zero geometry. Their data table includes **Sum** and **Average** of the
displayed categories; this average is not per month. Positive net bars
show surplus and negative bars show deficit; negative expenses increase net.
Income-only currencies remain visible. Use their
**View ... data** buttons for exact values without hovering. Axes are explicitly
relative, not currency; very small amounts can be invisible in plots while
remaining exact in data tables. Each currency is separate.

Open the dedicated **Compare spending** sidebar entry (`/compare-spending`),
separate from Summary. Choose Months, Years, or Yearly averages, select 2–6
distinct periods, and press **Compare periods**. Add/remove controls change the
selection; results are fetched only on submission. Current periods are partial;
future periods are refused. Yearly averages use inclusive **From year / To year**
ranges, divide due expenses by the number of calendar years including zero-spend
years, and round once to 18 decimal places. Future endpoints are refused; an
included current year is explicitly partial and is not annualized.
The numbered legend gives each average's year count.
All categories and currency totals appear in the comparison table even
when the chart displays only the eight highest-ranked categories.
Failures keep selectors and the labelled last successful results, not fake zeros.

Apply `014_comparison_navigation.sql` with `make migrate` for the sixth sidebar
feature. Existing orders receive Compare spending immediately after Summary;
other feature ordering, themes, profiles, and financial records are preserved.
The comparison page starts from the current UTC date and fetches results only
when submitted, independently of Summary's selected year.

The chart feature adds Recharts through the shadcn
registry; run `make local-dev-up` once when receiving that dependency change.
Subsequent ordinary source edits still require only a browser refresh.

## Operations and troubleshooting

Access tokens renew server-side before rendering, within a 60-second expiry
buffer, using the official SDK. Follow the
[Auth0 refresh-token configuration](../frontend/README.md#automatic-token-renewal),
then sign out/in once to obtain a refresh token. Normal refresh/rotation needs no
container restart. Missing/revoked/expired refresh credentials require sign-in;
provider/discovery/configuration failures show a private 503 with retry guidance.
Retry by refreshing the page; verify tenant availability and application settings
if it persists. Logs contain SDK error codes only, not tokens/provider details.
Never enable `/auth/access-token`, copy tokens into browser storage, or weaken TLS
to diagnose renewal.

```bash
make compose-logs
make local-apps-stop
make local-containers-down
```

`local-apps-stop` preserves running PostgreSQL. `local-containers-down` removes
containers/networks, including the test database, but preserves `postgres-data`.
Neither command deletes the development data volume.

A healthy API process with `/ready` returning 503 indicates missing database
configuration or a failed PostgreSQL connection. Connection errors log only the
error type, not the connection string. A setup message on the frontend means
required Auth0 environment names are missing; it is not a successful login.

If frontend sign-in works but the API returns 401, verify the tenant, RS256
signing, audience, and the frontend application's user-delegated access to that
API. Sign out/in after changing audience configuration. Do not log or share
tokens, cookies, client secrets, or full OAuth callback URLs.
