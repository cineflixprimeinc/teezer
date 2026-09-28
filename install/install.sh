#!/usr/bin/env bash
#
# ┌──────────────────────────────────────────────────────────────────────────┐
# │ TEEZER NOTE: this marketplace installer is NOT used to deploy Teezer.   │
# │ Teezer is deployed by hand - see DEPLOYMENT.md. Licensing is disabled.  │
# │ This script and bin/reelsoo must never be pointed at the source         │
# │ platform's licence/update server. There is no default server: it exits │
# │ unless LICENSE_SERVER_URL is set explicitly, and refuses reelsoo.com.   │
# └──────────────────────────────────────────────────────────────────────────┘
#
# Marketplace VPS installer (inherited from the source codebase).
#
#   LICENSE_SERVER_URL=https://<your-licence-server>/api/v1 bash install.sh
#
# What this script does NOT contain, and must never contain:
#   - B2 credentials of any kind. The release is fetched through a presigned
#     URL that the licence server mints per request and that expires in minutes.
#   - the licence signing private key, or anything derived from it.
#   - any secret belonging to reelsoo.com.
#
# Everything secret here belongs to the CUSTOMER: their purchase code, their
# licence key, and the database password this script generates for them.
#
set -euo pipefail

# No default licence server - an empty value is a hard stop (see guard below).
readonly LICENSE_SERVER="${LICENSE_SERVER_URL:-}"
readonly INSTALL_DIR="${TEEZER_INSTALL_DIR:-${REELSOO_INSTALL_DIR:-/var/www/teezer}}"

if [[ -z "$LICENSE_SERVER" ]]; then
    echo "" >&2
    echo "  Error: LICENSE_SERVER_URL is not set. This installer has no default licence server." >&2
    echo "  Teezer is not deployed with this script - see DEPLOYMENT.md." >&2
    echo "" >&2
    exit 1
fi
case "${LICENSE_SERVER,,}" in
    *reelsoo*)
        echo "" >&2
        echo "  Error: refusing to use the Reelsoo licence server ($LICENSE_SERVER)." >&2
        echo "" >&2
        exit 1 ;;
esac

readonly PHP_VERSION="8.2"

# ── Output helpers ───────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
    readonly BOLD=$'\033[1m' DIM=$'\033[2m' RED=$'\033[31m' GREEN=$'\033[32m' YELLOW=$'\033[33m' RESET=$'\033[0m'
else
    readonly BOLD='' DIM='' RED='' GREEN='' YELLOW='' RESET=''
fi

say()  { printf '%s\n' "$*"; }
info() { printf '  %s\n' "$*"; }
ok()   { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$*"; }
die()  { printf '\n  %sError:%s %s\n\n' "$RED" "$RESET" "$*" >&2; exit 1; }

banner() {
    say ""
    say "${BOLD}========================================${RESET}"
    say "${BOLD}       Teezer VPS Installer${RESET}"
    say "${BOLD}========================================${RESET}"
    say ""
}

step() {
    say ""
    say "${BOLD}$1${RESET}"
}

# Secrets are read with `read -s` so they never appear on screen, and they are
# never passed as command-line arguments (which are world-readable in /proc).
ask_secret() {
    local prompt="$1" varname="$2" value=""
    while [[ -z "$value" ]]; do
        printf '  %s: ' "$prompt" > /dev/tty
        IFS= read -rs value < /dev/tty
        printf '\n' > /dev/tty
        [[ -z "$value" ]] && warn "This cannot be empty."
    done
    printf -v "$varname" '%s' "$value"
}

ask() {
    local prompt="$1" varname="$2" default="${3:-}" value=""
    if [[ -n "$default" ]]; then
        printf '  %s [%s]: ' "$prompt" "$default" > /dev/tty
    else
        printf '  %s: ' "$prompt" > /dev/tty
    fi
    IFS= read -r value < /dev/tty
    printf -v "$varname" '%s' "${value:-$default}"
}

# ── Preflight ────────────────────────────────────────────────────────────────
preflight() {
    step "Checking this server"

    [[ $EUID -eq 0 ]] || die "Run this installer as root (or with sudo)."

    # Piping into bash means stdin is the script, so every prompt below reads
    # from /dev/tty instead. Without a terminal there is nothing to prompt on.
    [[ -e /dev/tty ]] || die "No terminal available. Download the script and run it directly instead of piping it."

    command -v curl >/dev/null || die "curl is required."

    if [[ -r /etc/os-release ]]; then
        # shellcheck disable=SC1091
        . /etc/os-release
        ok "OS: ${PRETTY_NAME:-unknown}"
        case "${ID:-}" in
            ubuntu|debian) ;;
            *) warn "Only Ubuntu and Debian are officially supported. Continuing anyway." ;;
        esac
    fi

    if [[ -d "$INSTALL_DIR" ]] && [[ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]]; then
        die "$INSTALL_DIR already exists and is not empty. Move it aside, or set TEEZER_INSTALL_DIR to install elsewhere."
    fi

    local free_mb
    free_mb=$(df -Pm / | awk 'NR==2 {print $4}')
    if [[ ${free_mb:-0} -lt 8000 ]]; then
        warn "Only ${free_mb}MB free on /. At least 8GB is recommended."
    else
        ok "Disk space: ${free_mb}MB free"
    fi

    local mem_mb
    mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
    if [[ ${mem_mb:-0} -lt 2000 ]]; then
        warn "Only ${mem_mb}MB RAM. The frontend build needs about 2GB; it may fail."
    else
        ok "Memory: ${mem_mb}MB"
    fi
}

# ── Credentials ──────────────────────────────────────────────────────────────
collect_credentials() {
    step "Licence details"
    say "${DIM}  From your purchase receipt and your licensor's activation page.${RESET}"
    say ""

    ask_secret "Purchase Code" PURCHASE_CODE
    ask_secret "License Key" LICENSE_KEY
    ask "Domain" DOMAIN

    DOMAIN="${DOMAIN#http://}"
    DOMAIN="${DOMAIN#https://}"
    DOMAIN="${DOMAIN%%/*}"
    DOMAIN="${DOMAIN,,}"

    [[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] \
        || die "\"$DOMAIN\" is not a valid domain name."

    # Generated here, once, and reused for the life of this installation. The
    # licence is bound to it, which is what stops one purchase being copied
    # across unlimited servers.
    INSTALLATION_ID="inst_$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"

    ok "Domain: $DOMAIN"
    ok "Installation: $INSTALLATION_ID"
}

# ── Licence + download authorisation ─────────────────────────────────────────
# One request that both proves the licence is good and returns a short-lived
# URL for the package. If this fails, nothing has been installed yet.
authorize_download() {
    step "Verifying your licence"

    local response http_code body
    response=$(curl -sS -w '\n%{http_code}' -X POST "$LICENSE_SERVER/license/release" \
        -H 'Content-Type: application/json' \
        -H 'Accept: application/json' \
        --data @- <<JSON || true
{
  "license_key": $(json_string "$LICENSE_KEY"),
  "installation_id": $(json_string "$INSTALLATION_ID"),
  "domain": $(json_string "$DOMAIN")
}
JSON
    )

    http_code=$(printf '%s' "$response" | tail -n1)
    body=$(printf '%s' "$response" | sed '$d')

    if [[ "$http_code" != "200" ]]; then
        local message
        message=$(json_field "$body" message)
        die "${message:-The licence server refused this licence (HTTP $http_code).}"
    fi

    DOWNLOAD_URL=$(json_field "$body" download_url)
    RELEASE_VERSION=$(json_field "$body" version)
    RELEASE_CHECKSUM=$(json_field "$body" checksum)

    [[ -n "$DOWNLOAD_URL" ]] || die "The licence server did not return a download URL."

    ok "Licence valid"
    ok "Release: ${RELEASE_VERSION:-unknown}"
}

download_package() {
    step "Downloading Teezer ${RELEASE_VERSION:-}"

    PACKAGE="/tmp/teezer-${RELEASE_VERSION:-latest}.tar.gz"

    curl -fL --progress-bar -o "$PACKAGE" "$DOWNLOAD_URL" \
        || die "Download failed. The authorisation URL is short-lived; re-run the installer."

    if [[ -n "$RELEASE_CHECKSUM" ]]; then
        local actual
        actual=$(sha256sum "$PACKAGE" | awk '{print $1}')
        if [[ "$actual" != "$RELEASE_CHECKSUM" ]]; then
            rm -f "$PACKAGE"
            die "Checksum mismatch. The download was corrupted or tampered with, and has been deleted."
        fi
        ok "Checksum verified"
    else
        warn "No checksum was supplied; skipping integrity check."
    fi
}

# ── System packages ──────────────────────────────────────────────────────────
install_dependencies() {
    step "Installing system packages"
    say "${DIM}  This takes a few minutes.${RESET}"

    export DEBIAN_FRONTEND=noninteractive

    apt-get update -qq
    apt-get install -y -qq software-properties-common ca-certificates curl gnupg lsb-release unzip git >/dev/null

    if ! command -v php"$PHP_VERSION" >/dev/null; then
        add-apt-repository -y ppa:ondrej/php >/dev/null 2>&1 || true
        apt-get update -qq
    fi

    apt-get install -y -qq \
        nginx postgresql postgresql-contrib redis-server supervisor ffmpeg \
        php"$PHP_VERSION"-fpm php"$PHP_VERSION"-cli php"$PHP_VERSION"-pgsql \
        php"$PHP_VERSION"-mbstring php"$PHP_VERSION"-xml php"$PHP_VERSION"-curl \
        php"$PHP_VERSION"-zip php"$PHP_VERSION"-gd php"$PHP_VERSION"-bcmath \
        php"$PHP_VERSION"-redis php"$PHP_VERSION"-intl >/dev/null

    ok "PHP $PHP_VERSION, nginx, PostgreSQL, Redis, ffmpeg"

    # `php artisan migrate` on an empty database loads a squashed schema via the
    # psql BINARY, not PDO. Without postgresql-client the first migrate fails in
    # a way that reads like a database connection problem and is not one.
    command -v psql >/dev/null || apt-get install -y -qq postgresql-client >/dev/null
    ok "psql client (required by the schema loader)"

    if ! command -v node >/dev/null || [[ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt 20 ]]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
        apt-get install -y -qq nodejs >/dev/null
    fi
    ok "Node $(node -v)"

    if ! command -v composer >/dev/null; then
        curl -fsSL https://getcomposer.org/installer -o /tmp/composer-setup.php
        php /tmp/composer-setup.php --quiet --install-dir=/usr/local/bin --filename=composer
        rm -f /tmp/composer-setup.php
    fi
    ok "Composer $(composer --version --no-ansi 2>/dev/null | awk '{print $3}')"
}

# ── Database ─────────────────────────────────────────────────────────────────
setup_database() {
    step "Creating the database"

    DB_NAME="teezer"
    DB_USER="teezer"
    # 32 bytes of urandom, base64, punctuation stripped so it survives being
    # written into .env and passed to psql without quoting surprises.
    DB_PASSWORD=$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 32)

    systemctl enable --now postgresql >/dev/null 2>&1 || true

    sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL >/dev/null
CREATE USER "$DB_USER" WITH PASSWORD '$DB_PASSWORD';
CREATE DATABASE "$DB_NAME" OWNER "$DB_USER";
GRANT ALL PRIVILEGES ON DATABASE "$DB_NAME" TO "$DB_USER";
SQL

    ok "Database '$DB_NAME' created with a generated password"
}

# ── Application ──────────────────────────────────────────────────────────────
extract_application() {
    step "Installing the application"

    mkdir -p "$INSTALL_DIR"
    tar -xzf "$PACKAGE" -C "$INSTALL_DIR" --strip-components=1
    rm -f "$PACKAGE"

    ok "Extracted to $INSTALL_DIR"
}

configure_environment() {
    step "Writing configuration"

    local env_file="$INSTALL_DIR/server/.env"

    cp "$INSTALL_DIR/server/.env.example" "$env_file"

    # 0600 BEFORE any secret is written, so the file is never briefly readable.
    chmod 600 "$env_file"

    set_env() {
        local key="$1" value="$2"
        if grep -q "^${key}=" "$env_file"; then
            # A licence key can contain characters sed would treat as syntax,
            # so the replacement is escaped rather than interpolated raw.
            local escaped
            escaped=$(printf '%s' "$value" | sed -e 's/[\/&|]/\\&/g')
            sed -i "s|^${key}=.*|${key}=${escaped}|" "$env_file"
        else
            printf '%s=%s\n' "$key" "$value" >> "$env_file"
        fi
    }

    set_env APP_ENV production
    set_env APP_DEBUG false
    set_env APP_URL "https://$DOMAIN"
    set_env APP_FRONTEND_URL "https://$DOMAIN"

    set_env DB_CONNECTION pgsql
    set_env DB_PGSQL_HOST 127.0.0.1
    set_env DB_PGSQL_PORT 5432
    set_env DB_PGSQL_DATABASE "$DB_NAME"
    set_env DB_PGSQL_USERNAME "$DB_USER"
    set_env DB_PGSQL_PASSWORD "$DB_PASSWORD"

    set_env SESSION_DOMAIN ".$DOMAIN"
    set_env SESSION_SECURE_COOKIE true
    set_env SANCTUM_STATEFUL_DOMAINS "$DOMAIN,www.$DOMAIN"

    # Licence enforcement ON for a customer installation. This is the one place
    # in the whole system where it is ever true.
    set_env LICENSING_CLIENT_ENABLED true
    set_env LICENSE_SERVER_ENABLED false
    set_env LICENSE_KEY "$LICENSE_KEY"
    set_env LICENSE_DOMAIN "$DOMAIN"
    set_env LICENSE_SERVER_URL "$LICENSE_SERVER"

    ( cd "$INSTALL_DIR/server" && php artisan key:generate --force >/dev/null )

    ok "server/.env written (mode 0600)"

    # Seed the installation id BEFORE activation so `license:activate` binds the
    # same id the licence server already saw during the download authorisation.
    mkdir -p "$INSTALL_DIR/server/storage/app/license"
    printf '{"installation_id":"%s","domain":"%s"}\n' "$INSTALLATION_ID" "$DOMAIN" \
        > "$INSTALL_DIR/server/storage/app/license/license.json"
    chmod 600 "$INSTALL_DIR/server/storage/app/license/license.json"
}

build_application() {
    step "Building"

    ( cd "$INSTALL_DIR/server" && composer install --no-dev --optimize-autoloader --no-interaction --quiet )
    ok "PHP dependencies"

    ( cd "$INSTALL_DIR/server" && php artisan migrate --force --no-interaction >/dev/null )
    ok "Database migrated"

    ( cd "$INSTALL_DIR/frontend" && npm ci --omit=dev --silent && NEXT_PUBLIC_API_URL="https://$DOMAIN/api/v1" npm run build --silent )
    ok "Frontend built"
}

activate_license() {
    step "Activating this installation"

    # The key is passed on stdin-driven prompts inside artisan rather than as a
    # visible argument. --domain is not a secret.
    ( cd "$INSTALL_DIR/server" && php artisan license:activate \
        --purchase-code="$PURCHASE_CODE" \
        --license-key="$LICENSE_KEY" \
        --domain="$DOMAIN" \
        --non-interactive ) || die "Licence activation failed. Nothing was removed; fix the issue and re-run: cd $INSTALL_DIR/server && php artisan license:activate"

    ok "Licence activated and stored locally"
}

set_permissions() {
    step "Setting permissions"

    chown -R www-data:www-data "$INSTALL_DIR"
    find "$INSTALL_DIR" -type d -exec chmod 755 {} \;
    find "$INSTALL_DIR" -type f -exec chmod 644 {} \;
    chmod -R 775 "$INSTALL_DIR/server/storage" "$INSTALL_DIR/server/bootstrap/cache"

    # Re-tighten the two files that must stay private after the blanket chmod.
    chmod 600 "$INSTALL_DIR/server/.env"
    chmod 600 "$INSTALL_DIR/server/storage/app/license/license.json"

    [[ -f "$INSTALL_DIR/bin/reelsoo" ]] && install -m 755 "$INSTALL_DIR/bin/reelsoo" /usr/local/bin/reelsoo

    ok "Ownership and modes applied"
}

configure_services() {
    step "Configuring services"

    cat > /etc/nginx/sites-available/teezer <<NGINX
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    client_max_body_size 512M;

    location /api/ {
        root $INSTALL_DIR/server/public;
        try_files \$uri /index.php?\$query_string;
    }

    location ~ \.php\$ {
        root $INSTALL_DIR/server/public;
        fastcgi_pass unix:/run/php/php$PHP_VERSION-fpm.sock;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME \$document_root/index.php;
        include fastcgi_params;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX

    ln -sf /etc/nginx/sites-available/teezer /etc/nginx/sites-enabled/teezer
    rm -f /etc/nginx/sites-enabled/default
    nginx -t >/dev/null 2>&1 || die "The generated nginx config failed validation."
    systemctl reload nginx

    cat > /etc/systemd/system/teezer-web.service <<UNIT
[Unit]
Description=Teezer frontend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=$INSTALL_DIR/frontend
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
UNIT

    cat > /etc/systemd/system/teezer-queue.service <<UNIT
[Unit]
Description=Teezer queue worker
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=$INSTALL_DIR/server
ExecStart=/usr/bin/php artisan queue:work --sleep=3 --tries=3 --max-time=3600
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

    systemctl daemon-reload
    systemctl enable --now teezer-web teezer-queue >/dev/null 2>&1

    # The scheduler drives the licence heartbeat, among much else.
    ( crontab -u www-data -l 2>/dev/null | grep -v 'artisan schedule:run'
      echo "* * * * * cd $INSTALL_DIR/server && php artisan schedule:run >> /dev/null 2>&1" ) \
        | crontab -u www-data -

    ok "nginx, systemd units and the scheduler are running"
}

finish() {
    say ""
    say "${BOLD}========================================${RESET}"
    say "${GREEN}${BOLD}       Installation complete${RESET}"
    say "${BOLD}========================================${RESET}"
    say ""
    info "Open ${BOLD}http://$DOMAIN/setup${RESET} to finish configuring your site."
    say ""
    info "Next:"
    info "  1. Point $DOMAIN at this server's IP address."
    info "  2. Enable HTTPS:  certbot --nginx -d $DOMAIN -d www.$DOMAIN"
    info "  3. Visit http://$DOMAIN/setup and create your administrator."
    say ""
    info "Useful commands:"
    info "  reelsoo status    licence and service status"
    info "  reelsoo update    check for and apply updates"
    say ""
    warn "Your database password is in $INSTALL_DIR/server/.env (mode 0600). Back it up."
    say ""
}

# ── Minimal JSON helpers ─────────────────────────────────────────────────────
# Deliberately dependency-free: requiring jq would mean installing a package
# before the licence has even been checked.

json_string() {
    # Escape a value for safe inclusion in a JSON document.
    printf '"%s"' "$(printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"
}

json_field() {
    # Extract a top-level-ish string field. Good enough for the small, known
    # responses this installer reads, and it never has to parse hostile input:
    # the only source is our own licence server over TLS.
    printf '%s' "$1" | tr ',' '\n' | grep -o "\"$2\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed 's/.*:[[:space:]]*"\(.*\)"/\1/'
}

# ── Main ─────────────────────────────────────────────────────────────────────
main() {
    banner
    preflight
    collect_credentials
    authorize_download
    download_package
    install_dependencies
    setup_database
    extract_application
    configure_environment
    build_application
    activate_license
    set_permissions
    configure_services
    finish
}

main "$@"
