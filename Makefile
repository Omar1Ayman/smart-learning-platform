# ============================================================================
# Common developer commands. Run `make` to see all.
# ============================================================================

.PHONY: help dev-up dev-down dev-logs backend-logs frontend-logs \
        test test-backend test-frontend lint lint-backend lint-frontend \
        migrate seed shell createsuperuser build

# --- Help ------------------------------------------------------------------

help:  ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# --- Development -----------------------------------------------------------

dev-up:  ## Start full stack (db + backend + frontend)
	docker compose up -d
	@echo ""
	@echo "  ✅ Backend:  http://localhost:8000"
	@echo "  ✅ Frontend: http://localhost:3000"
	@echo ""
	@echo "  First run takes 2-3 minutes (installing deps)."
	@echo "  Logs: make dev-logs"

dev-down:  ## Stop all containers
	docker compose down

dev-logs:  ## Tail all logs
	docker compose logs -f

backend-logs:  ## Tail backend logs only
	docker compose logs -f backend

frontend-logs:  ## Tail frontend logs only
	docker compose logs -f frontend

migrate:  ## Run Django migrations
	docker compose exec backend python manage.py migrate

seed:  ## Seed demo data (wipes existing demo tenants)
	docker compose exec backend python manage.py reset_and_seed --force

shell:  ## Open Django shell
	docker compose exec backend python manage.py shell

createsuperuser:  ## Create a Django admin user
	docker compose exec backend python manage.py createsuperuser

# --- Testing ---------------------------------------------------------------

test: test-backend test-frontend  ## Run both test suites

test-backend:  ## Backend tests (fresh DB)
	cd backend && pytest --create-db -q

test-frontend:  ## Frontend lint + build
	cd frontend && npm run lint && npm run build

# --- Linting ---------------------------------------------------------------

lint: lint-backend lint-frontend  ## Lint both

lint-backend:  ## Backend lint
	cd backend && ruff check .

lint-frontend:  ## Frontend lint
	cd frontend && npm run lint

# --- Build -----------------------------------------------------------------

build:  ## Build production Docker images
	docker build -t smart-learning-backend:latest ./backend
	docker build -t smart-learning-frontend:latest --build-arg NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1 ./frontend