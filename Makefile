.DEFAULT_GOAL := help
PYTHON ?= python3
VENV ?= .venv
COMPOSE ?= docker compose
DEV_COMPOSE = $(COMPOSE) -f compose.yaml -f compose.dev.yaml
TEST_ARGS ?=
FRONTEND_TEST_ARGS ?= tests/*.test.js
BROWSER_TEST_ARGS ?=

help:
	@printf '%s\n' \
	  'Local Docker workflow:' \
	  '  local-dev-up           Start persistent services with backend/frontend reload' \
	  '  local-containers-up    Build and start production-mode local services' \
	  '  local-apps-stop        Stop applications; keep PostgreSQL running' \
	  '  local-containers-down  Remove containers/network; preserve database volume' \
	  '  compose-config         Validate base and development Compose configurations' \
	  '  migrate                Apply pending forward-only database migrations' \
	  '  compose-ps / compose-logs  Inspect the local stack' \
	  'Validation (Docker):' \
	  '  test                   Backend tests, including dedicated PostgreSQL check' \
	  '  test TEST_ARGS=tests/test_identity.py::test_identity_preserves_sdk_rejection' \
	  '  lint / format-check    Python lint / formatting checks' \
	  '  frontend-test          Frontend unit tests' \
	  '  frontend-lint          ESLint and Prettier checks' \
	  '  frontend-build         Build the production SSR image' \
	  '  frontend-test-browser  Build and run Chromium smoke tests' \
	  '  check                  Run all validation targets' \
	  'Optional native tooling: install, frontend-install (see docs/RUNBOOK.md)'

install:
	$(PYTHON) -m venv "$(VENV)"
	"$(VENV)/bin/python" -m pip install -e '.[dev]'

frontend-install:
	npm --prefix frontend ci

local-dev-up:
	$(DEV_COMPOSE) up -d --build --renew-anon-volumes --wait --wait-timeout 180 postgres backend frontend

local-containers-up:
	$(COMPOSE) up -d --build --wait postgres backend frontend

migrate:
	$(COMPOSE) run --rm --build migrate

local-apps-stop:
	$(COMPOSE) stop frontend backend

local-containers-down:
	$(COMPOSE) --profile "*" down

compose-config:
	$(COMPOSE) --profile "*" config --quiet
	$(DEV_COMPOSE) --profile "*" config --quiet

compose-ps:
	$(COMPOSE) --profile "*" ps

compose-logs:
	$(COMPOSE) logs --follow --tail 100 postgres backend frontend

test:
	$(COMPOSE) run --rm --build backend-test python -m pytest -q $(TEST_ARGS)

lint:
	$(COMPOSE) run --rm --build --no-deps backend-test ruff check app tests

format-check:
	$(COMPOSE) run --rm --build --no-deps backend-test ruff format --check app tests

frontend-test:
	$(COMPOSE) run --rm --build --no-deps frontend-test npm run test:single -- $(FRONTEND_TEST_ARGS)

frontend-lint:
	$(COMPOSE) run --rm --build --no-deps frontend-test sh -c 'npm run lint && npm run format:check'

frontend-build:
	$(COMPOSE) build frontend

frontend-test-browser:
	$(COMPOSE) run --rm --build --no-deps frontend-browser npm run test:e2e -- $(BROWSER_TEST_ARGS)

check: test lint format-check frontend-test frontend-lint frontend-build frontend-test-browser

.PHONY: help install frontend-install local-dev-up local-containers-up migrate local-apps-stop local-containers-down compose-config compose-ps compose-logs test lint format-check frontend-test frontend-lint frontend-build frontend-test-browser check
