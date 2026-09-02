.PHONY: up down logs build rebuild ps clean backend-test frontend-build

up: ## Build (if needed) and start the whole stack
	docker compose up -d --build

down: ## Stop the stack
	docker compose down

logs: ## Tail logs from all services
	docker compose logs -f

build: ## Build all images
	docker compose build

rebuild: ## Rebuild images without cache
	docker compose build --no-cache

ps: ## Show running services
	docker compose ps

clean: ## Stop and remove containers + volumes (DELETES the database)
	docker compose down -v

backend-test: ## Run backend unit tests
	cd backend && go test ./...

frontend-build: ## Type-check and build the frontend
	cd frontend && npm ci && npm run build
