#!/bin/bash
set -e

echo "=== PostgreSQL: Loading finance schema into financedb ==="
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "financedb" \
    -f /docker-entrypoint-initdb.d/demo_finance_pg.sql

echo "=== PostgreSQL: Creating retaildb ==="
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "financedb" \
    -c "CREATE DATABASE retaildb OWNER \"$POSTGRES_USER\";"

echo "=== PostgreSQL: Loading retail schema into retaildb ==="
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "retaildb" \
    -f /docker-entrypoint-initdb.d/postgres-retail.sql

echo "=== PostgreSQL: All schemas loaded successfully ==="
