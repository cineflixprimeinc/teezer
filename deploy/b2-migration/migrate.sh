#!/usr/bin/env bash
#
# Copy every object from the Cloudflare R2 bucket into the Backblaze B2 bucket.
#
# Run this on VPS-1, in tmux, BEFORE deploying the B2-only code. The app keeps
# serving from R2 the whole time this runs - nothing here mutates R2 or touches
# the running site.
#
# Usage:
#   export R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_ENDPOINT=... R2_BUCKET=...
#   export B2_APPLICATION_KEY_ID=... B2_APPLICATION_KEY=... B2_ENDPOINT=... B2_BUCKET=...
#   ./migrate.sh copy      # the bulk copy - safe to re-run, resumes where it left off
#   ./migrate.sh check     # verify every object landed, by size and count
#   ./migrate.sh sizes     # print both bucket sizes without copying anything
#
set -euo pipefail

MODE="${1:-copy}"

for v in R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_ENDPOINT R2_BUCKET \
         B2_APPLICATION_KEY_ID B2_APPLICATION_KEY B2_ENDPOINT B2_BUCKET; do
  if [ -z "${!v:-}" ]; then
    echo "Missing required env var: $v" >&2
    exit 1
  fi
done

command -v rclone >/dev/null || { echo "rclone not installed: curl https://rclone.org/install.sh | sudo bash" >&2; exit 1; }

# Remotes are defined entirely through env so no credentials are ever written
# to ~/.config/rclone/rclone.conf on a shared box.
export RCLONE_CONFIG_SRC_TYPE=s3
export RCLONE_CONFIG_SRC_PROVIDER=Cloudflare
export RCLONE_CONFIG_SRC_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_SRC_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_SRC_ENDPOINT="$R2_ENDPOINT"
export RCLONE_CONFIG_SRC_REGION=auto

export RCLONE_CONFIG_DST_TYPE=s3
export RCLONE_CONFIG_DST_PROVIDER=Other
export RCLONE_CONFIG_DST_ACCESS_KEY_ID="$B2_APPLICATION_KEY_ID"
export RCLONE_CONFIG_DST_SECRET_ACCESS_KEY="$B2_APPLICATION_KEY"
export RCLONE_CONFIG_DST_ENDPOINT="$B2_ENDPOINT"

SRC="SRC:${R2_BUCKET}"
DST="DST:${B2_BUCKET}"

# --transfers/--checkers are tuned for a VPS with a decent uplink; lower them if
# the box is also serving traffic and you care about the CPU.
#
# copy, never sync: sync would delete anything in B2 that is absent from R2, and
# on a re-run after the cutover that is precisely the set of NEW uploads. One
# mistyped subcommand would erase every video posted since the switch.
COMMON_FLAGS=(
  --transfers 32
  --checkers 64
  --s3-chunk-size 64M
  --s3-upload-concurrency 8
  --fast-list
  --progress
  --stats 15s
  --log-level INFO
)

case "$MODE" in
  copy)
    echo "Copying ${SRC} -> ${DST}"
    echo "Safe to interrupt and re-run: already-copied objects are skipped."
    rclone copy "$SRC" "$DST" "${COMMON_FLAGS[@]}"
    echo
    echo "Copy finished. Now run: $0 check"
    ;;

  check)
    # --size-only because R2 and B2 compute ETags differently for multipart
    # uploads, so a checksum comparison reports thousands of false mismatches on
    # exactly the large video files you most want to verify.
    echo "Verifying ${SRC} against ${DST} (size + presence)..."
    rclone check "$SRC" "$DST" --size-only --fast-list --log-level NOTICE
    echo "Check passed: every object in R2 exists in B2 at the same size."
    ;;

  sizes)
    echo "--- R2 (${R2_BUCKET}) ---"
    rclone size "$SRC" --fast-list
    echo "--- B2 (${B2_BUCKET}) ---"
    rclone size "$DST" --fast-list
    ;;

  *)
    echo "Unknown mode: $MODE (expected copy | check | sizes)" >&2
    exit 1
    ;;
esac
