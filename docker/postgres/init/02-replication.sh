#!/bin/sh
# Lets the load-test read replica (Phase 9) copy this database: a login that
# may only replicate, allowed to connect over Docker's network.
# Runs once, the first time the database is created (empty volume).
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" \
  -v password="${REPLICATION_PASSWORD:-replica-lab-only}" <<'EOSQL'
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD :'password';
EOSQL

echo "host replication replicator all scram-sha-256" >> "$PGDATA/pg_hba.conf"
