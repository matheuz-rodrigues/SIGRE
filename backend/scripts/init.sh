#!/bin/bash
set -e  

if [ ! -d "alembic" ]; then
    alembic init alembic
fi
python3 ./scripts/create_tables.py
alembic stamp head
# O admin inicial é criado no startup da API (main.py:_seed_admin), que valida a força da senha
# e aceita ADMIN_SEED_PASSWORD vazia; scripts/seed.py fica só para uso manual
RELOAD_FLAG=""
if [ "$ENV" = "development" ]; then
    RELOAD_FLAG="--reload"
fi

# --proxy-headers: usa X-Forwarded-For/Proto apenas dos proxies listados em FORWARDED_ALLOW_IPS
# (IP real no rate limit e https correto no callback OAuth atrás do proxy TLS)
# --no-server-header / --no-date-header: não expõe o servidor (uvicorn) nem o relógio da máquina
uvicorn app.main:app --host 0.0.0.0 --port 8000 $RELOAD_FLAG \
    --proxy-headers --forwarded-allow-ips "${FORWARDED_ALLOW_IPS:-127.0.0.1}" \
    --no-server-header --no-date-header
