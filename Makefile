.PHONY: up down logs shell migrate test lint db-reset build

up:
	docker-compose up -d

down:
	docker-compose down

build:
	docker-compose build

logs:
	docker-compose logs -f api

shell:
	docker-compose exec api bash

migrate:
	docker-compose exec api alembic upgrade head

migrate-down:
	docker-compose exec api alembic downgrade -1

test:
	docker-compose exec api pytest tests/ -v --tb=short

lint:
	docker-compose exec api ruff check app/

format:
	docker-compose exec api ruff format app/

db-reset:
	docker-compose down -v
	docker-compose up -d postgres redis
	@echo "Waiting for postgres..."
	@sleep 5
	$(MAKE) migrate

ps:
	docker-compose ps

restart-api:
	docker-compose restart api

# Phase 3 — 통합
migrate-gen:
	docker-compose exec api alembic revision --autogenerate -m "$(MSG)"

ai-classify-all:
	curl -s -X POST http://localhost:8000/api/v1/transactions/bulk-classify | python3 -m json.tool

ws-test:
	@echo "WebSocket 연결 테스트 (wscat 필요: npm i -g wscat)"
	wscat -c ws://localhost:8000/ws/dashboard

frontend-install:
	docker-compose exec frontend npm install

logs-all:
	docker-compose logs -f api ai-engine celery-worker

# Phase 4 — 인프라 & 모니터링
monitoring-up:
	docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d

tf-init:
	cd infra/terraform && terraform init

tf-plan-staging:
	cd infra/terraform && terraform workspace select staging && \
	  terraform plan -var-file=environments/staging/terraform.tfvars

tf-apply-staging:
	cd infra/terraform && terraform workspace select staging && \
	  terraform apply -var-file=environments/staging/terraform.tfvars

tf-plan-prod:
	cd infra/terraform && terraform workspace select prod && \
	  terraform plan -var-file=environments/prod/terraform.tfvars

tf-apply-prod:
	@echo "WARNING: 프로덕션 배포입니다. 계속하려면 CONFIRM=yes 를 전달하세요"
	@test "$(CONFIRM)" = "yes" || (echo "취소됨" && exit 1)
	cd infra/terraform && terraform workspace select prod && \
	  terraform apply -var-file=environments/prod/terraform.tfvars
