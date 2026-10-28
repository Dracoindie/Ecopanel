#!/bin/sh
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'EOSQL'
SELECT 'CREATE DATABASE ecopanel_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ecopanel_test')\gexec
EOSQL
