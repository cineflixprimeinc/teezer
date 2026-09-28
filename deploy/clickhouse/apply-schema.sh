#!/usr/bin/env bash
# Apply deploy/clickhouse/schema/*.sql to a RUNNING ClickHouse.
#
# The compose file mounts ./schema into /docker-entrypoint-initdb.d, but that
# directory only runs ONCE - on first boot against an empty data volume. On an
# instance that already has data it is silently ignored, which is a great way to
# believe you shipped a schema change that never landed. Use this instead.
#
# Every statement is written CREATE ... IF NOT EXISTS, so this is idempotent and
# safe to re-run on every deploy.
#
#   ./apply-schema.sh                      # against the local compose container
#   CH_HOST=10.0.0.2 ./apply-schema.sh     # against a remote instance
set -euo pipefail

cd "$(dirname "$0")"

CH_CONTAINER="${CH_CONTAINER:-teezer-clickhouse}"
CH_HOST="${CH_HOST:-}"

if [[ -f .env ]]; then
  set -a; source .env; set +a
fi

: "${CLICKHOUSE_USER:?set CLICKHOUSE_USER (or create deploy/clickhouse/.env)}"
: "${CLICKHOUSE_PASSWORD:?set CLICKHOUSE_PASSWORD (or create deploy/clickhouse/.env)}"

run_sql() {
  local file="$1"
  echo "── applying ${file}"
  if [[ -n "$CH_HOST" ]]; then
    clickhouse-client --host "$CH_HOST" \
      --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" \
      --multiquery < "$file"
  else
    docker exec -i "$CH_CONTAINER" clickhouse-client \
      --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" \
      --multiquery < "$file"
  fi
}

for f in schema/*.sql; do
  run_sql "$f"
done

echo "✅ schema applied"
