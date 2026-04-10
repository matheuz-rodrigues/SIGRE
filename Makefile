# Variáveis
DC_DEV = docker compose -f docker-compose.dev.yml
DC_PROD = docker compose -f docker-compose.prod.yml

.PHONY: dev prod down-dev down-prod logs-dev logs-prod clean reset shell-backend shell-db

# --- Desenvolvimento ---
dev: down-prod ## Sobe o ambiente de desenvolvimento (Hot-Reload)
	$(DC_DEV) up --build -d

down-dev: ## Para o ambiente de desenvolvimento
	$(DC_DEV) down

logs-dev: ## Mostra os logs de desenvolvimento
	$(DC_DEV) logs -f

# --- Produção ---
prod: down-dev ## Sobe o ambiente de produção (Build final/Nginx)
	$(DC_PROD) up --build -d

down-prod: ## Para o ambiente de produção
	$(DC_PROD) down

logs-prod: ## Mostra os logs de produção
	$(DC_PROD) logs -f

# --- Utilitários ---
clean: ## Remove containers, redes e imagens locais
	$(DC_DEV) down -v --rmi local
	$(DC_PROD) down -v --rmi local

reset: clean dev ## Faz um reset completo e sobe em modo dev

shell-backend: ## Acessa o terminal do backend (Dev)
	docker exec -it sigre_backend_dev bash

shell-db: ## Acessa o terminal do banco de dados (Dev)
	docker exec -it sigre_db_dev psql -U user -d alocacoes

help: ## Mostra esta ajuda
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
