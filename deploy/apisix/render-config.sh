#!/usr/bin/env bash
# Renders config/dashboard-conf.yaml.template -> config/dashboard-conf.yaml
# (git-ignored - contains the dashboard's login credentials) by substituting
# values from .env. Run once before the first `docker compose up`, and again
# any time .env's dashboard values change.
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Missing .env - copy .env.apisix.example to .env and fill it in first." >&2
  exit 1
fi
set -a; source .env; set +a

envsubst < config/dashboard-conf.yaml.template > config/dashboard-conf.yaml
echo "Rendered config/dashboard-conf.yaml"
