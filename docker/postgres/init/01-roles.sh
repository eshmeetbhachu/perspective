#!/bin/sh
# Creates the two least-privilege roles (Decision D19).
# Runs once, the first time the database is created (empty volume).
set -e

: "${MIGRATOR_PASSWORD:?MIGRATOR_PASSWORD must be set}"
: "${APP_PASSWORD:?APP_PASSWORD must be set}"

# Passwords are passed as psql variables and inserted with :'name', which
# quotes them safely. The heredoc is quoted ('EOSQL') so the shell leaves the
# SQL untouched.
psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -v migrator_password="$MIGRATOR_PASSWORD" \
  -v app_password="$APP_PASSWORD" <<'EOSQL'

-- 1. The two roles. LOGIN = can connect. Neither is a superuser.
CREATE ROLE perspective_migrator LOGIN PASSWORD :'migrator_password';
CREATE ROLE perspective_app LOGIN PASSWORD :'app_password';

-- 2. Only our roles (and the superuser) may connect to this database.
REVOKE ALL ON DATABASE perspective FROM PUBLIC;
GRANT CONNECT ON DATABASE perspective TO perspective_migrator, perspective_app;

-- 3. The migrator changes the structure: it owns the schema where tables live,
--    and may create new schemas (Drizzle keeps its migration history in one)
--    and extensions (e.g. pg_trgm in Phase 2).
ALTER SCHEMA public OWNER TO perspective_migrator;
GRANT CREATE ON DATABASE perspective TO perspective_migrator;

-- 4. The app may see the schema, but not create anything in it.
GRANT USAGE ON SCHEMA public TO perspective_app;

-- 5. Every table/sequence the migrator creates in the future automatically
--    grants the app row-level access only: no DROP, ALTER, or TRUNCATE.
ALTER DEFAULT PRIVILEGES FOR ROLE perspective_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO perspective_app;
ALTER DEFAULT PRIVILEGES FOR ROLE perspective_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO perspective_app;

EOSQL
