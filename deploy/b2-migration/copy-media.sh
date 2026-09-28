#!/usr/bin/env bash
#
# One-way media seed: copy objects from the source platform's B2
# bucket into Teezer's OWN B2 bucket.
#
#   READ-ONLY source.  `rclone copy` only - never `sync`, `move` or `delete`.
#   Nothing is ever written to, or removed from, the source bucket.
#   DRY-RUN by default. Nothing is copied unless you pass --run.
#
# Credentials are NOT in this file. Configure two rclone remotes on the operator
# machine (`rclone config`, or RCLONE_CONFIG_<NAME>_* env vars):
#
#   source-ro   type=b2 (or s3), using a key the source owner issued with
#                READ-ONLY capabilities (listBuckets, listFiles, readFiles) on
#                the source bucket only. Never use a read/write or master key.
#   teezer-b2    type=b2 (or s3), using a Teezer application key scoped to the
#                Teezer bucket (needs listFiles, readFiles, writeFiles).
#
# Then:
#   export SRC_BUCKET=<source bucket name>        # e.g. the source media bucket
#   export DST_BUCKET=<teezer bucket name>        # Teezer's media bucket
#   ./copy-media.sh                   # dry run: lists what WOULD copy
#   ./copy-media.sh --run             # real copy (resumable, re-runnable)
#   ./copy-media.sh --check           # verify: every source object exists in Teezer
#
# Repeat with the private bucket (identity documents / DM media) by exporting
# SRC_BUCKET/DST_BUCKET for that pair - it must go to Teezer's PRIVATE bucket.
#
# Optional env:
#   SRC_REMOTE (default source-ro)   DST_REMOTE (default teezer-b2)
#   PREFIX     (copy only this key prefix, e.g. "avatars/"; default: whole bucket)
#   TRANSFERS  (default 16)           CHECKERS (default 32)
#
set -euo pipefail

MODE="dry-run"
for arg in "$@"; do
  case "$arg" in
    --run)   MODE="run" ;;
    --check) MODE="check" ;;
    --dry-run) MODE="dry-run" ;;
    -h|--help) sed -n '2,34p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $arg (expected --run | --check | --dry-run)" >&2; exit 2 ;;
  esac
done

SRC_REMOTE="${SRC_REMOTE:-source-ro}"
DST_REMOTE="${DST_REMOTE:-teezer-b2}"
SRC_BUCKET="${SRC_BUCKET:-}"
DST_BUCKET="${DST_BUCKET:-}"
PREFIX="${PREFIX:-}"
TRANSFERS="${TRANSFERS:-16}"
CHECKERS="${CHECKERS:-32}"

die() { echo "ERROR: $*" >&2; exit 1; }

command -v rclone >/dev/null || die "rclone not installed (https://rclone.org/install/)"
[ -n "$SRC_BUCKET" ] || die "SRC_BUCKET is not set"
[ -n "$DST_BUCKET" ] || die "DST_BUCKET is not set"

# Guard rails: the destination must be a different remote AND a different bucket.
[ "$SRC_REMOTE" != "$DST_REMOTE" ] || die "SRC_REMOTE and DST_REMOTE are the same ($SRC_REMOTE)"
[ "$SRC_BUCKET" != "$DST_BUCKET" ] || die "SRC_BUCKET and DST_BUCKET are the same ($SRC_BUCKET) - refusing"
case "$DST_REMOTE" in
  "$SRC_REMOTE"|*source*) die "DST_REMOTE '$DST_REMOTE' looks like the source platform - refusing to write there" ;;
esac

rclone listremotes | grep -qx "${SRC_REMOTE}:" || [ -n "$(env | grep "^RCLONE_CONFIG_$(echo "$SRC_REMOTE" | tr 'a-z-' 'A-Z_')_TYPE=")" ] \
  || die "rclone remote '$SRC_REMOTE' is not configured"
rclone listremotes | grep -qx "${DST_REMOTE}:" || [ -n "$(env | grep "^RCLONE_CONFIG_$(echo "$DST_REMOTE" | tr 'a-z-' 'A-Z_')_TYPE=")" ] \
  || die "rclone remote '$DST_REMOTE' is not configured"

SRC="${SRC_REMOTE}:${SRC_BUCKET}${PREFIX:+/$PREFIX}"
DST="${DST_REMOTE}:${DST_BUCKET}${PREFIX:+/$PREFIX}"

COMMON_FLAGS=(
  --transfers "$TRANSFERS"
  --checkers "$CHECKERS"
  --fast-list
  --stats 30s
  --log-level INFO
)

echo "Source      : $SRC   (read-only)"
echo "Destination : $DST"
echo "Mode        : $MODE"
echo

case "$MODE" in
  dry-run)
    # --immutable: an object that already exists in the destination with
    # different content is reported as an error instead of being overwritten.
    rclone copy "$SRC" "$DST" --dry-run --immutable "${COMMON_FLAGS[@]}"
    echo
    echo "Dry run only - nothing was copied. Re-run with --run to copy."
    ;;
  run)
    echo "Copying (rclone copy, never sync). Safe to interrupt and re-run."
    rclone copy "$SRC" "$DST" --immutable --progress "${COMMON_FLAGS[@]}"
    echo
    echo "Copy finished. Verify with: $0 --check"
    ;;
  check)
    # --one-way: only asks "is every source object present in Teezer?"; extra
    # objects already uploaded to Teezer are fine. --size-only avoids false
    # mismatches from differing multipart checksums.
    rclone check "$SRC" "$DST" --one-way --size-only --fast-list --log-level NOTICE
    echo "Check passed: every source object exists in the Teezer bucket at the same size."
    ;;
esac
