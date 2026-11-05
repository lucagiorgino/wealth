# Wealth

A web application foundation for tracking expenses, income, and personal assets.
Built with **Python/FastAPI, PostgreSQL, Next.js SSR, shadcn/ui, and Auth0**.

The application implements external sign-in, a protected SSR dashboard, and
multiple wallets per user. Each wallet has a name, colour, icon, currency
(default EUR), exact initial amount (default `0`), and a transaction-derived
current amount. Users can create, edit, delete unused wallets, and list only their own
wallets through a dedicated, paginated table. A responsive sidebar
connects it to the landing dashboard. PostgreSQL schema changes use versioned
migrations.
The sidebar's bottom profile menu opens account management and sign-out.
The Account page manages the Wealth display name and one profile picture, chosen
from existing icons or a custom upload, without changing Auth0 sign-in credentials. Uploaded PNG/JPEG/WebP
images are validated, resized, stripped of metadata, and stored privately.
The Categories page manages private, two-level categories with editable names,
colours, and icons, including optional copies of predefined category groups.

The Transactions page supports private income, expenses, and transfers, with
exact amounts, dates, category/subcategory selection, filtering, pagination,
editing, and confirmed deletion. Weekly, monthly, and annual recurring series
can run indefinitely or for a specified total number of occurrences.
Its month-based workspace uses shadcn search/filter controls, a contextual empty
state, and a floating creation dialog. It opens the current UTC month; **All dates**
retains access to the full history.
Year selection is separate from the month rail. Currency-labelled values and
whole-filter income, expense, transfer, and net summaries use exact amounts;
the wallet-expense breakdown starts collapsed and currencies stay separate.
The private Summary page analyses due expenses by category/subcategory with
year navigation, monthly/annual tables, expandable details, and hideable
category totals. Different currencies remain separate.
Asset tracking and currency conversion remain planned. No sample balances
or financial records are presented as real data.

## Run locally

Requires Docker with Compose 2.24+.

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env.local
# Configure Auth0 in both files to enable sign-in; see frontend/README.md.
make compose-config
make local-dev-up
```

Open **http://localhost:3000**. Without Auth0 configuration, the welcome page
explains the required settings and private routes stay closed. PostgreSQL and
the API can still start. API documentation is at **http://localhost:8000/docs**.

Leave these services running while implementing features. Python changes reload
the API; Next.js Fast Refresh picks up frontend changes. Refresh the browser to
see updated server-rendered data. No container teardown/rebuild is needed for
ordinary source edits. Dependency, environment, and migration changes have
explicit steps in the [runbook](docs/RUNBOOK.md#live-development).
`make local-containers-up` remains available for production-mode local builds.

```bash
make test
make lint
make format-check
make frontend-test
make frontend-lint
make frontend-test-browser
```

`make help` lists commands. `make check` runs all checks, including the frontend
production image build and browser smoke tests. Containers are rebuilt before
tests so checks use the current source, not a stale image.

## Documentation

| Guide                                                       | Owns                                                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [Contributor instructions](.github/copilot-instructions.md) | Development rules and cross-file conventions                                           |
| [Project blueprint](PROJECT-BLUEPRINT.md)                   | Architecture, trust boundaries, and persistence decisions                              |
| [API reference](docs/API.md)                                | Implemented HTTP contracts                                                             |
| [Runbook](docs/RUNBOOK.md)                                  | Setup, commands, tests, and local operations                                           |
| [Frontend guide](frontend/README.md)                        | SSR, Auth0 application configuration, and UI tooling                                   |
| [Implementation status](docs/IMPLEMENTATION_STATUS.md)      | Capability/evidence inventory, Mermaid data model, architecture and operation diagrams |

Development rules follow the reference project's Python-first boundaries,
server-only API tokens, explicit refusal paths, and canonical documentation.
This project uses PostgreSQL; it does not inherit that application's traffic
ingestion pipeline or deployment infrastructure.
