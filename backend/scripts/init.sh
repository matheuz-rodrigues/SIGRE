#!/bin/bash
set -e  

if [ ! -d "alembic" ]; then
    alembic init alembic
fi
python3 ./scripts/create_tables.py
alembic stamp head
if [ -f "./scripts/seed.py" ]; then
    python3 ./scripts/seed.py
fi
RELOAD_FLAG=""
if [ "$ENV" = "development" ]; then
    RELOAD_FLAG="--reload"
fi

# --proxy-headers: usa X-Forwarded-For/Proto apenas dos proxies listados em FORWARDED_ALLOW_IPS
# (IP real no rate limit e https correto no callback OAuth atrás do proxy TLS)
uvicorn app.main:app --host 0.0.0.0 --port 8000 $RELOAD_FLAG \
    --proxy-headers --forwarded-allow-ips "${FORWARDED_ALLOW_IPS:-127.0.0.1}"
