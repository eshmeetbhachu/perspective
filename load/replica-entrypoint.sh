#!/bin/sh
# Starts a read replica of the `postgres` service (Phase 9). The first time,
# it copies the primary with pg_basebackup; --write-recovery-conf makes
# it follow the primary's write-ahead log from then on.
set -e

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  mkdir -p "$PGDATA"
  chown postgres "$PGDATA"
  chmod 700 "$PGDATA"
  until gosu postgres pg_basebackup --host=postgres --username=replicator \
    --pgdata="$PGDATA" --write-recovery-conf --wal-method=stream --checkpoint=fast; do
    echo "waiting for the primary..."
    sleep 2
  done
fi

exec docker-entrypoint.sh postgres -c shared_preload_libraries=pg_stat_statements
