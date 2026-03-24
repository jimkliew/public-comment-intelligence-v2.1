.PHONY: lint test typecheck ci up down logs

# Python
lint:
	ruff check backend/
	ruff format --check backend/

lint-fix:
	ruff check --fix backend/
	ruff format backend/

test:
	pytest backend/tests/ -v --tb=short

# Frontend
typecheck:
	cd frontend && npx tsc --noEmit

# All checks (mirrors CI)
ci: lint test typecheck

# Docker
up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f
