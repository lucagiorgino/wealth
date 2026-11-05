# Project context

Wealth is a web application for tracking expenses, income, and personal assets.
The application provides health/readiness endpoints, external authentication,
and SSR dashboard, paginated wallets/transactions, annual expense analysis, spending comparisons, patrimony,
account profile, and category pages. Users can
manage their own currency-denominated wallets with computed current balances,
manage a Wealth display name/icon/custom image, and customize
private two-level categories with optional predefined groups. Transactions support
income, expenses, transfers, balance adjustments, and recurring series. Assets combine live/frozen wallet cash
and dated manual asset/liability valuations. Live market prices and currency
conversion remain planned. Do not present planned behavior as implemented.

## Architecture

- **Backend:** Python/FastAPI. `app/main.py` registers routes; `app/api/`
  owns HTTP contracts, `app/core/` configuration and identity, and `app/db/`
  PostgreSQL connectivity. Introduce business logic in `app/services/` as
  features require it, not in routes.
- **Frontend:** Next.js App Router SSR in JavaScript/JSX with Tailwind and
  registry-generated shadcn/ui components. Read `frontend/AGENTS.md` and relevant
  bundled Next.js guides before changing framework APIs.
- **Persistence:** PostgreSQL users, wallets, categories, subcategories, transactions, assets, valuations, and frozen monthly balances with numbered SQL migrations.
  Python owns persistence and authorization; the frontend must not query the
  database. `app/db/migrate.py` applies pending files transactionally under an
  advisory lock before the Compose API starts.
- **Runtime:** Docker Compose for local deployment and development tests.
  `make local-dev-up` adds `compose.dev.yaml` for persistent Uvicorn reload and
  Next.js Fast Refresh. Base Compose and validation targets retain
  production-mode builds.
- **Authentication:** Auth0 owns end-user credentials. The Next.js SDK manages
  sessions; the FastAPI SDK verifies access tokens. API tokens stay server-side.
  No browser token endpoint or local username/password system is permitted.
  The SDK renews tokens before SSR with a 60-second buffer and persists rotated
  tokens in encrypted HttpOnly cookies. Typed missing/revoked credential failures
  require login; provider/discovery/configuration outages stay explicit 503s.

## Development and test workflow

Use Docker-based Make targets from the repository root; setup and native
fallback commands live in `docs/RUNBOOK.md`.

```bash
make help
make compose-config
make local-dev-up
make local-containers-up
make migrate
make test
make test TEST_ARGS=tests/test_identity.py::test_identity_preserves_sdk_rejection
make lint
make format-check
make frontend-test
make frontend-test FRONTEND_TEST_ARGS='--test-name-pattern=refusal tests/api-client.test.js'
make frontend-lint
make frontend-build
make frontend-test-browser BROWSER_TEST_ARGS=tests/browser/bootstrap.spec.js
make check
```

The backend tests use a separate ephemeral PostgreSQL service. Native
database-backed tests require `TEST_DATABASE_URL` and skip without it. Never
point that variable at development/production data. `make local-containers-down`
preserves the development database volume.

Leave `make local-dev-up` services running across feature implementations.
Ordinary source changes need only a browser refresh, not container teardown or
rebuild. Rerun that target after dependency/environment changes; apply new SQL
migrations with `make migrate`. See `docs/RUNBOOK.md#live-development`.

Frontend unit tests use Node's test runner with injectable HTTP helpers.
Playwright starts production servers on ports 3100/3101 and a mock API on 3102;
authenticated tests use the Auth0 SDK's `generateSessionCookie` utility, not an
application auth bypass. These tests do not exercise real Auth0 login or
PostgreSQL persistence; database-backed API tests cover persistence and ownership.

## Cross-file conventions

- Read the relevant canonical guide before changing behavior. HTTP contracts
  belong in `docs/API.md`, architecture in `PROJECT-BLUEPRINT.md`, operations in
  `docs/RUNBOOK.md`, and frontend/Auth0 setup in `frontend/README.md`. Link rather
  than copy detailed explanations.
- Change API schemas/contracts, handlers, refusal-path tests, and consumer code
  together. Do not add a database schema without its migration strategy.
- Root `.env` configures the API/database; `frontend/.env.local` configures SSR.
  Both are ignored. Example files contain placeholders/local-only credentials.
  Never log credentials, access tokens, session cookies, or raw financial data.
- Missing identity-provider settings must fail closed, not enable demo users.
  `/health` is liveness; `/ready` checks PostgreSQL, not Auth0.
- Every private page and server action calls `requireSession()` independently.
  The shared `(app)` layout and `proxy.js` are not authorization boundaries.
  Revalidate affected pages only after a successful mutation; preserve form
  edits on failure.
- Account display names/icons/images are Wealth-only preferences, never authentication
  identifiers. Derive profile ownership from verified `sub`, preserve wallets
  on updates, and keep credentials/provider settings under Auth0.
- Profile images use authenticated binary uploads, never external URLs.
  Enforce the 2 MiB stream limit and 4096-pixel side limit before decoding;
  Pillow normalizes static PNG/JPEG/WebP to metadata-free PNG at most 256 pixels.
  Store only normalized bytes and return a private PNG data URL. Profile saves
  preserve images; successful profile/image mutations revalidate the private layout.
- Reads, including `/api/v1/me` and account defaults, do not provision users.
  Profile saves, wallet/category creation, and preset imports insert users as
  needed within their write transaction without resetting existing preferences.
  Return account defaults only after a successful database read.
- Sensitive versioned API responses and SSR identity fetches must not be cached.
  Keep `server-only` imports on SDK/API wrappers and disable API redirects.
  The backend API URL is a server-side origin, not a browser URL or API prefix.
- `frontend/lib/api.js` obtains server-only tokens; `lib/api-client.js` owns
  injectable HTTP calls and response validation. Keep pure configuration and
  form-payload helpers independently testable without importing SDK wrappers.
  Handle expected `BackendError`/input errors explicitly and rethrow unexpected
  errors rather than turning failures into empty data or successful saves.
- Record ownership comes from verified identity and must be enforced by
  the API, not an owner identifier supplied by a form or browser.
- Request/response models live in `app/schemas/`; mutation inputs reject extra
  fields. Keep supported icons, validation limits, and defaults aligned across
  schemas, SQL constraints (through new migrations), frontend helpers/controls,
  and API documentation.
- Categories have exactly two levels in separate tables. Subcategories use a
  composite parent/owner foreign key to an owned main category. Presets are
  optional private copies, and repeated imports must never overwrite edits.
  Roots have immutable income/expense kinds; child kind is inherited. Root names
  are unique within owner and kind, child names within parent. Income presets are
  Salary, MealTicket, Transfer, Cash, Other (refund, private sell).
- Wallet amounts use Python `Decimal` and PostgreSQL `numeric`. Preserve them
  as strings in JSON/frontend code, never JavaScript `Number` or JSON floats.
  Keep the zero default in both request schema and database migration.
- Wallet currency defaults to EUR; supported codes align with the shared currency
  allowlist, SQL constraint, and frontend controls. Balances use the shared anchored
  occurrence projection and count only entries due through today UTC, including
  incoming/outgoing transfers. Never persist live balances or modify initial amounts
  when saving transactions. Referenced wallets cannot be deleted or change currency.
- Transaction amounts are nonzero exact decimals: expenses may be negative,
  balance adjustments may be signed; income/transfers must remain positive. Negative expenses reduce spending and
  increase balances; never coerce them into income or use JavaScript money math.
  Income uses income categories; expenses/transfers use expense categories.
  Enforce the generated transaction family FK and kind-scoped CSV resolution.
  Transfers require two different owned wallets with the same currency. Composite foreign keys enforce
  owned wallet/category references and the selected subcategory's parent.
  Referenced categories cannot be deleted (409); never cascade away transactions.
- Balance adjustments are category-free, nonrecurring signed deltas effective
  on the first day of the following UTC month. They have no destination and
  never contribute to income, expenses, transfers, net or spending comparisons.
- A transaction row defines a single entry or recurring series. Listing projects
  due occurrences through today's UTC date without writes or a scheduler.
  Monthly/yearly repeats are anchored to the original date; edits/deletes affect
  the entire series. Keep this scope explicit in the UI and API documentation.
- Transaction summaries use the same owned filtered occurrence snapshot as
  history, before pagination. Sum each currency separately; net is income minus
  expenses and excludes transfers. Wallet expense breakdowns exclude income
  and transfers. Keep aggregates and exact decimal arithmetic server-side.
- Annual category analysis shows separate expense and income tables from one
  owned due-only snapshot. PostgreSQL computes monthly/year/category/subcategory/
  currency totals and monthly net (income minus expenses); transfers and future
  initial entries are excluded. Grouped monthly income/expense bars share a scale;
  net bars use their own signed scale. Direct category entries use a nonpersisted
  null-ID bucket. Never sum subtotal/detail rows together or mix currencies.
  Period comparisons remain expense-only.
  Monthly chart series always include January-December; future months contain
  zero due activity, not forecasts. Chart totals and displayed-ranking sum/average
  are server-computed; averages round once half-up to 18 places. Donuts never
  coerce negative category totals into positive shares.
- Summary charts use server-generated dimensionless geometry, never JavaScript
  conversion of monetary strings.
  Signed plots normalize by exact absolute magnitude and expose a zero baseline.
  Period comparisons are read-only, same-kind, and bounded to 2–6 started periods.
  Yearly averages use inclusive year ranges,
  include zero-spend years, and count an included partial current year without
  annualizing it. Refuse future endpoints; round the exact ratio once to 18 places.
- Assets freeze completed UTC months under an owner advisory lock. Current wallet
  cash carries the previous close plus this month's effective movements. Initial
  history is seeded once; later writes cannot overwrite snapshots. Pending closure
  precedes financial mutations transactionally and runs every 60 seconds at API
  startup/runtime. Preserve closed sources/currencies without live-source FKs;
  absent historical sources must not count as missing valuations.
  Manual nonnegative valuations carry forward;
  liabilities subtract from net worth. Keep currencies separate and missing/future
  values distinct from zero. Never sum snapshots across months. Incomplete adjacent
  months have no change; percentage change from zero is undefined.
- Add forward-only files under `app/db/migrations/`; never edit an applied
  migration. Include SQL files in package data and keep the Mermaid ER diagram
  aligned with the actual schema. `schema_migrations` is infrastructure state,
  not a business entity.
- Add shadcn components through the frontend's registry CLI/configuration.
  Keep JavaScript/JSX and the existing SSR/client boundary.
- Optional assistant skills are tooling, not runtime dependencies. Downloaded
  `.agents/skills/` and skill lock files are ignored.

## Documentation conventions

Every implemented feature or behavior change must include accompanying
documentation in Mermaid syntax where diagrams are appropriate:

- Sequence diagrams showing the implemented interactions between relevant
  actors, frontend, backend, database, and external services.
- A component diagram showing the implemented system boundaries and
  dependencies; use a Mermaid flowchart to express components.
- A database data-model diagram in
  `docs/IMPLEMENTATION_STATUS.md#application-data-model`, updated with every
  schema change. Use Mermaid `erDiagram` for actual tables, columns, SQL types,
  primary/foreign keys, and relationship cardinalities. Until tables exist,
  retain an explicit Mermaid empty-state diagram rather than inventing entities.
- High-level documentation explaining the implemented behavior, alongside any
  more detailed documentation needed to understand it.

Keep diagrams and documentation synchronized with the implementation. Distinguish
planned behavior from implemented behavior, especially during bootstrapping.
Maintain high-level components, development topology, deployment target
boundaries, operation sequences, and their index in
`docs/IMPLEMENTATION_STATUS.md`. Preserve these visual views even where they
overlap prose.
