#!/usr/bin/env bash
#
# Restore a pg_dump custom-format file (taken read-only on the source platform)
# into a NEW, LOCAL PostgreSQL database `teezer` owned by role `teezer`.
#
#   sudo bash deploy/db/restore-reelsoo-dump.sh /root/reelsoo.dump [--force-empty-check] [--jobs N] [--port 5432]
#
# What it does:
#   1. validates the dump (pg_restore --list)
#   2. creates role `teezer` (LOGIN, no password yet) if missing
#   3. creates database `teezer` owned by `teezer` if missing. If the database
#      already exists it REFUSES, unless --force-empty-check is given AND the
#      database has zero tables in any non-system schema.
#   4. pre-creates the extensions listed in the dump (as the superuser)
#   5. pg_restore --no-owner --no-acl --role=teezer (objects end up owned by teezer)
#   6. ANALYZE and prints a short summary
#
# What it NEVER does:
#   - connect to any remote host: every connection goes over the local UNIX
#     socket (/var/run/postgresql); PGHOST/PGHOSTADDR/PGSERVICE are cleared.
#   - run `php artisan migrate` or `db:seed`, or any post-restore SQL.
#     deploy/db/post-restore-teezer.sql is REVIEW-ONLY and is run by hand.
#   - drop or overwrite an existing database.
#
# The dump itself is produced by the operator on the source server with:
#   pg_dump -Fc --no-owner --no-acl -d <source_db> -f reelsoo.dump
# and copied here by the operator. This script has no knowledge of that server.
set -euo pipefail

DB_NAME="teezer"
DB_ROLE="teezer"
SOCKET_DIR="/var/run/postgresql"
PG_PORT="5432"
JOBS="1"
FORCE_EMPTY_CHECK=0
DUMP=""

usage() { sed -n '2,30p' "$0"; }
die()   { echo "ERROR: $*" >&2; exit 1; }
say()   { printf '\n==> %s\n' "$*"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --force-empty-check) FORCE_EMPTY_CHECK=1 ;;
    --jobs)  shift; JOBS="${1:-}";   [[ "$JOBS" =~ ^[0-9]+$ ]]    || die "--jobs needs a number" ;;
    --port)  shift; PG_PORT="${1:-}"; [[ "$PG_PORT" =~ ^[0-9]+$ ]] || die "--port needs a number" ;;
    -h|--help) usage; exit 0 ;;
    -*) die "Unknown option: $1" ;;
    *)  [ -z "$DUMP" ] || die "Only one dump file may be given"; DUMP="$1" ;;
  esac
  shift
done

[ -n "$DUMP" ] || { usage; exit 2; }
[ -f "$DUMP" ] || die "Dump file not found: $DUMP"
[ -r "$DUMP" ] || die "Dump file not readable: $DUMP"

# ── Local-only connections ────────────────────────────────────────────────────
unset PGHOST PGHOSTADDR PGSERVICE PGSERVICEFILE PGDATABASE PGUSER PGPASSWORD PGPASSFILE || true
[ -d "$SOCKET_DIR" ] || die "Local PostgreSQL socket dir $SOCKET_DIR not found - is PostgreSQL installed on THIS machine?"

if [ "$(id -un)" = "postgres" ]; then
  AS_PG=()
elif [ "$(id -u)" = "0" ]; then
  AS_PG=(sudo -u postgres)
else
  die "Run as root (sudo) or as the postgres user"
fi

# Every client call pins host = local socket dir and the local port.
PSQL=("${AS_PG[@]}" psql -X -v ON_ERROR_STOP=1 -h "$SOCKET_DIR" -p "$PG_PORT" -U postgres)
q() { "${PSQL[@]}" -d "${2:-postgres}" -tAc "$1"; }

command -v pg_restore >/dev/null || die "pg_restore not found (install postgresql-client-17)"

say "Checking the dump"
# The dump file may be root-only; read the TOC as the invoking user.
TOC="$(pg_restore --list "$DUMP")" || die "Not a valid pg_dump custom-format archive: $DUMP"
echo "$TOC" | head -12 || true
echo "   ($(echo "$TOC" | grep -c ';' || true) TOC lines)"

say "Local server"
q "SELECT version();" || die "Cannot connect to local PostgreSQL on socket $SOCKET_DIR port $PG_PORT"

# ── Role ──────────────────────────────────────────────────────────────────────
say "Role '$DB_ROLE'"
if [ "$(q "SELECT 1 FROM pg_roles WHERE rolname = '$DB_ROLE';")" = "1" ]; then
  echo "   exists"
else
  q "CREATE ROLE $DB_ROLE LOGIN;" >/dev/null
  echo "   created (LOGIN, no password - set one afterwards: sudo -u postgres psql -c '\\password $DB_ROLE')"
fi

# ── Database ──────────────────────────────────────────────────────────────────
say "Database '$DB_NAME'"
if [ "$(q "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME';")" = "1" ]; then
  [ "$FORCE_EMPTY_CHECK" = "1" ] \
    || die "Database '$DB_NAME' already exists. Refusing. (Pass --force-empty-check to restore into it ONLY if it has no tables.)"
  NTABLES="$(q "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema');" "$DB_NAME")"
  [ "$NTABLES" = "0" ] \
    || die "Database '$DB_NAME' already contains $NTABLES table(s). Refusing to restore on top of existing data."
  echo "   exists and is empty (0 tables) - continuing because of --force-empty-check"
else
  "${AS_PG[@]}" createdb -h "$SOCKET_DIR" -p "$PG_PORT" -U postgres -O "$DB_ROLE" -E UTF8 -T template0 "$DB_NAME"
  echo "   created, owner $DB_ROLE"
fi
q "GRANT ALL ON SCHEMA public TO $DB_ROLE; ALTER SCHEMA public OWNER TO $DB_ROLE;" "$DB_NAME" >/dev/null

# ── Extensions (need superuser; the restore itself runs as role teezer) ───────
say "Extensions used by the dump"
EXTS="$(echo "$TOC" | awk '$4 == "EXTENSION" && $0 !~ /COMMENT/ {print $6}' | sort -u)"
if [ -n "$EXTS" ]; then
  for e in $EXTS; do
    [[ "$e" =~ ^[a-z0-9_]+$ ]] || { echo "   skipping unexpected extension name: $e"; continue; }
    q "CREATE EXTENSION IF NOT EXISTS \"$e\";" "$DB_NAME" >/dev/null && echo "   $e"
  done
else
  echo "   none"
fi

# ── Restore ───────────────────────────────────────────────────────────────────
LOG="/tmp/teezer-restore-$(date +%Y%m%d-%H%M%S).log"
say "pg_restore -> $DB_NAME (jobs=$JOBS, log: $LOG)"
# The postgres user must be able to read the dump; stream it through stdin when
# running with sudo so file permissions do not matter (stdin rules out --jobs>1).
set +e
if [ "${#AS_PG[@]}" -gt 0 ] && [ "$JOBS" = "1" ]; then
  "${AS_PG[@]}" pg_restore -h "$SOCKET_DIR" -p "$PG_PORT" -U postgres -d "$DB_NAME" \
      --no-owner --no-acl --role="$DB_ROLE" --verbose < "$DUMP" >"$LOG" 2>&1
else
  "${AS_PG[@]}" pg_restore -h "$SOCKET_DIR" -p "$PG_PORT" -U postgres -d "$DB_NAME" \
      --no-owner --no-acl --role="$DB_ROLE" --jobs="$JOBS" --verbose "$DUMP" >"$LOG" 2>&1
fi
RC=$?
set -e
ERRS="$(grep -c 'pg_restore: error' "$LOG" || true)"
echo "   pg_restore exit code $RC, $ERRS error line(s)"
if [ "$ERRS" != "0" ]; then
  grep 'pg_restore: error' "$LOG" | head -20
  echo "   Review $LOG. Errors about extensions/comments already present are usually harmless."
fi

say "ANALYZE"
q "ANALYZE;" "$DB_NAME" >/dev/null && echo "   done"

say "Summary"
q "SELECT count(*) || ' tables' FROM pg_tables WHERE schemaname = 'public';" "$DB_NAME"
for t in users videos migrations; do
  n="$(q "SELECT count(*) FROM public.$t;" "$DB_NAME" 2>/dev/null || echo 'n/a')"
  echo "   $t: $n"
done
q "SELECT 'tables not owned by $DB_ROLE: ' || count(*) FROM pg_tables WHERE schemaname='public' AND tableowner <> '$DB_ROLE';" "$DB_NAME"

cat <<NEXT

Restore finished. NOTHING else has been run. Next, by hand:

  1. Set the role password:   sudo -u postgres psql -c '\\password $DB_ROLE'
  2. REVIEW deploy/db/post-restore-teezer.sql and run the statements you
     agree with, one by one:  sudo -u postgres psql -d $DB_NAME
  3. Check pending migrations WITHOUT running them:
       cd /var/www/teezer/server && php artisan migrate:status
     Run 'php artisan migrate' only as a deliberate decision, after a backup.
     Never run db:seed against this restored database.
NEXT

[ "$RC" = "0" ] || exit "$RC"
