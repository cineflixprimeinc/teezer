#!/usr/bin/env bash
# Applies every declarative route/upstream file in routes/ to APISIX's Admin
# API, idempotently - each file carries its own target path
# (_admin_api_path) and is PUT there, so re-running this after editing a
# single file only touches what changed. Requires `jq` and `envsubst`
# (gettext-base) - see README "Prerequisites".
#
# Usage: ./apply-routes.sh   (run from this directory, after `docker compose up -d`)
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Missing .env - copy .env.apisix.example to .env and fill it in first." >&2
  exit 1
fi
set -a; source .env; set +a

# Rate-limit policy lives in its own committed file - see its header. Sourced
# after .env so a value may still be overridden per-host from .env if a box
# ever needs to differ, without editing committed policy.
if [ -f ratelimit-policies.env ]; then
  set -a; source ratelimit-policies.env; set +a
else
  echo "Missing ratelimit-policies.env - route files reference \${RL_*} and would render empty." >&2
  exit 1
fi

ADMIN_URL="http://127.0.0.1:9180"

# A private temp file per run, not a fixed path.
#
# This used to be /tmp/apisix-apply-response.json. One earlier run under sudo
# left it owned by root, after which every later run as `ubuntu` died with
# curl exit 23 ("failed writing body") - and because the failure happens inside
# a command substitution before anything is echoed, `set -e` killed the script
# with no output at all, having applied only part of the config.
RESPONSE_FILE=$(mktemp)
trap 'rm -f "$RESPONSE_FILE"' EXIT

apply_file() {
  local file="$1"
  local rendered path body status missing

  # envsubst substitutes an UNSET variable with an empty string and says
  # nothing. For `"count": ${RL_X}` that yields `"count": ` - invalid JSON the
  # Admin API rejects loudly. Far worse, for a node key it yields `":"`, which
  # is VALID JSON and applies cleanly as an upstream with no host and no port:
  # every request through that route then fails with "no valid upstream node"
  # and a 503, with nothing in the apply output to suggest anything was wrong.
  # That is precisely how the Go upstream was applied broken.
  #
  # So: every ${VAR} a file references must be set, checked per file, before
  # anything is sent.
  # `|| true`, and a plain for-loop rather than a pipeline, on purpose:
  # under `set -euo pipefail` a grep that matches nothing exits 1, and a
  # `while ... [ -z x ] && echo` loop exits 1 whenever the LAST variable is
  # present - either one kills the script at the assignment, silently, before
  # a single route is applied. That is how this guard broke its own run.
  local vars
  vars=$(grep -oE '\$\{[A-Za-z_][A-Za-z0-9_]*\}' "$file" | tr -d '${}' | sort -u || true)
  missing=""
  for v in $vars; do
    if [ -z "${!v:-}" ]; then missing="$missing $v"; fi
  done
  if [ -n "$missing" ]; then
    echo "FAIL $file - these variables are unset:" >&2
    echo "$missing" >&2
    echo "Set them in .env (secrets/host-specific) or ratelimit-policies.env (limits)." >&2
    exit 1
  fi

  rendered=$(envsubst < "$file")
  path=$(echo "$rendered" | jq -r '._admin_api_path')
  body=$(echo "$rendered" | jq 'del(._admin_api_path, ._comment)')

  if [ -z "$path" ] || [ "$path" == "null" ]; then
    echo "SKIP $file - no _admin_api_path" >&2
    return
  fi

  status=$(curl -s -o "$RESPONSE_FILE" -w '%{http_code}' \
    -X PUT "${ADMIN_URL}${path}" \
    -H "X-API-KEY: ${APISIX_ADMIN_KEY}" \
    -H 'Content-Type: application/json' \
    -d "$body")

  if [[ "$status" == "200" || "$status" == "201" ]]; then
    echo "OK   $file -> $path"
  else
    echo "FAIL $file -> $path (HTTP $status)" >&2
    cat "$RESPONSE_FILE" >&2
    echo >&2
    exit 1
  fi
}

# Upstreams first - routes below reference them by id. Applying a route whose
# upstream_id does not exist yet is rejected by the Admin API, so any new
# upstream file has to be added here too; the 0*.json glob below will not pick
# it up.
apply_file "routes/upstream.json"
apply_file "routes/upstream-go.json"

# Then routes, in file order (numeric prefixes = priority-independent
# application order; actual precedence at request time is each route's own
# "priority" field, not this order).
for f in routes/0*.json; do
  apply_file "$f"
done

echo "Done. Verify with: curl -s ${ADMIN_URL}/apisix/admin/routes -H \"X-API-KEY: \${APISIX_ADMIN_KEY}\" | jq"
