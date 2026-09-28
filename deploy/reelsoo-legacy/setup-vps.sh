#!/bin/bash
# ── TEEZER: disabled. Reelsoo-only legacy script kept for reference; see ../reelsoo-legacy/README.md ──
echo "Refusing to run: $0 is a Reelsoo-only legacy script (not for Teezer)." >&2; exit 1
# =============================================================================
# Reelsoo Full Stack VPS Setup - Ubuntu 22.04 LTS
# Installs: Nginx, PHP 8.2, MySQL 8, Node.js 20, PM2, Certbot
# Deploys:  Laravel API + Next.js frontend + Next.js admin
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "\n${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
step() { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; }

# ─── CONFIG ──────────────────────────────────────────────────────────────────
APP_DIR="/var/www/reelsoo"
GITHUB_REPO="https://github.com/cineflixprime/reelsoo.git"
DB_NAME="reelsoo"
DB_USER="reelsoo"
DB_PASS="ReelsooDB$(openssl rand -hex 8)!"
ADMIN_EMAIL="admin@reelsoo.com"
ADMIN_PASS="Admin@Reelsoo$(date +%Y)!"

echo -e "\n${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Reelsoo VPS Setup Starting...      ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""
warn "SAVE THESE CREDENTIALS:"
echo "  DB Password : $DB_PASS"
echo "  Admin Email : $ADMIN_EMAIL"
echo "  Admin Pass  : $ADMIN_PASS"
echo ""
sleep 3

# ─── PHASE 1: System Update ───────────────────────────────────────────────────
step "Phase 1: System Update"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y git curl wget unzip software-properties-common \
  apt-transport-https ca-certificates gnupg lsb-release ufw openssl
log "System updated"

# ─── PHASE 2: Nginx ───────────────────────────────────────────────────────────
step "Phase 2: Installing Nginx"
apt-get install -y nginx
systemctl enable nginx
systemctl start nginx
log "Nginx installed"

# ─── PHASE 3: PHP 8.2 ────────────────────────────────────────────────────────
step "Phase 3: Installing PHP 8.2"
add-apt-repository ppa:ondrej/php -y
apt-get update -y
apt-get install -y \
  php8.2 php8.2-fpm php8.2-mysql php8.2-mbstring php8.2-xml \
  php8.2-curl php8.2-zip php8.2-bcmath php8.2-gd php8.2-intl
systemctl enable php8.2-fpm
systemctl start php8.2-fpm
log "PHP 8.2 installed"

# ─── PHASE 4: Composer ───────────────────────────────────────────────────────
step "Phase 4: Installing Composer"
curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer
chmod +x /usr/local/bin/composer
log "Composer installed ($(composer --version --no-ansi))"

# ─── PHASE 5: MySQL 8 ────────────────────────────────────────────────────────
step "Phase 5: Installing MySQL 8"
apt-get install -y mysql-server
systemctl enable mysql
systemctl start mysql
mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '$DB_PASS';"
mysql -u root -p"$DB_PASS" -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p"$DB_PASS" -e "CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';"
mysql -u root -p"$DB_PASS" -e "GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost'; FLUSH PRIVILEGES;"
log "MySQL 8 installed and database created"

# ─── PHASE 6: Node.js 20 + PM2 ───────────────────────────────────────────────
step "Phase 6: Installing Node.js 20 + PM2"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
npm install -g pm2
log "Node.js $(node -v) + PM2 installed"

# ─── PHASE 7: Certbot ────────────────────────────────────────────────────────
step "Phase 7: Installing Certbot"
apt-get install -y certbot python3-certbot-nginx
log "Certbot installed"

# ─── PHASE 7b: FFmpeg (video processing) ─────────────────────────────────────
step "Phase 7b: Installing FFmpeg"
apt-get install -y ffmpeg
log "FFmpeg installed ($(ffmpeg -version | head -1))"

# ─── PHASE 8: Clone Repository ───────────────────────────────────────────────
step "Phase 8: Cloning Repository"
mkdir -p "$APP_DIR"
cd "$APP_DIR"

if git clone "$GITHUB_REPO" . 2>/dev/null; then
  log "Repository cloned (public)"
else
  warn "Repo is private. Enter your GitHub Personal Access Token:"
  read -s GITHUB_TOKEN
  echo ""
  git clone "https://oauth2:$GITHUB_TOKEN@github.com/cineflixprime/reelsoo.git" .
  log "Repository cloned (private with token)"
fi

# ─── PHASE 9: Laravel Backend ────────────────────────────────────────────────
step "Phase 9: Setting up Laravel Backend"
cd "$APP_DIR/server"
composer install --no-dev --optimize-autoloader

cat > .env << ENVEOF
APP_NAME=Reelsoo
APP_ENV=production
APP_KEY=
APP_DEBUG=false
APP_URL=https://api.reelsoo.com

LOG_CHANNEL=daily
LOG_DEPRECATIONS_CHANNEL=null
LOG_LEVEL=error

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=${DB_NAME}
DB_USERNAME=${DB_USER}
DB_PASSWORD=${DB_PASS}

BROADCAST_DRIVER=log
CACHE_DRIVER=file
FILESYSTEM_DISK=public
QUEUE_CONNECTION=database
SESSION_DRIVER=database
SESSION_LIFETIME=120
SESSION_DOMAIN=reelsoo.com
SESSION_SECURE_COOKIE=true

FRONTEND_URL=https://reelsoo.com
ADMIN_FRONTEND_URL=https://reelsooadmin6784.reelsoo.com
CORS_ORIGIN=https://reelsoo.com,https://www.reelsoo.com,https://reelsooadmin6784.reelsoo.com
SANCTUM_STATEFUL_DOMAINS=reelsoo.com,www.reelsoo.com,reelsooadmin6784.reelsoo.com

MAIL_MAILER=log
MAIL_FROM_ADDRESS="noreply@reelsoo.com"
MAIL_FROM_NAME="Reelsoo"

ADMIN_NAME="Reelsoo Admin"
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASS}

# ── Cloudflare R2 - fill in after setup ──────────────────────────────────────
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET=
CLOUDFLARE_R2_ENDPOINT=
CLOUDFLARE_R2_URL=
CLOUDFLARE_R2_REGION=auto
ENVEOF

php artisan key:generate
php artisan storage:link
php artisan migrate --force
php artisan db:seed --force
php artisan config:cache
php artisan route:cache
php artisan view:cache

chown -R www-data:www-data "$APP_DIR/server/storage" "$APP_DIR/server/bootstrap/cache"
chmod -R 775 "$APP_DIR/server/storage" "$APP_DIR/server/bootstrap/cache"
log "Laravel backend ready"

# ─── PHASE 10: Build Frontend ─────────────────────────────────────────────────
step "Phase 10: Building Frontend (reelsoo.com)"
cd "$APP_DIR/frontend"
cat > .env.local << 'ENVEOF'
NEXT_PUBLIC_API_URL=https://api.reelsoo.com/api/v1
NEXT_PUBLIC_APP_URL=https://reelsoo.com
ENVEOF
npm install
npm run build
log "Frontend built"

# ─── PHASE 11: Build Admin ───────────────────────────────────────────────────
step "Phase 11: Building Admin Panel (reelsooadmin6784.reelsoo.com)"
cd "$APP_DIR/admin"
cat > .env.local << 'ENVEOF'
NEXT_PUBLIC_API_URL=https://api.reelsoo.com/api/v1
NEXT_PUBLIC_ADMIN_URL=https://reelsooadmin6784.reelsoo.com
ENVEOF
npm install
npm run build
log "Admin panel built"

# ─── PHASE 12: Nginx Config ───────────────────────────────────────────────────
step "Phase 12: Configuring Nginx"

cat > /etc/nginx/sites-available/reelsoo-api << 'NGINXEOF'
server {
    listen 80;
    listen [::]:80;
    server_name api.reelsoo.com;
    root /var/www/reelsoo/server/public;
    index index.php;
    client_max_body_size 100M;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
        fastcgi_hide_header X-Powered-By;
    }

    location ~ /\.env { deny all; }
    location ~ /\.ht  { deny all; }
}
NGINXEOF

cp "$APP_DIR/deploy/nginx/reelsoo-web.conf"   /etc/nginx/sites-available/reelsoo-web
cp "$APP_DIR/deploy/nginx/reelsoo-admin.conf" /etc/nginx/sites-available/reelsoo-admin

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/reelsoo-api   /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/reelsoo-web   /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/reelsoo-admin /etc/nginx/sites-enabled/

nginx -t && systemctl reload nginx
log "Nginx configured"

# ─── PHASE 13: PM2 ───────────────────────────────────────────────────────────
step "Phase 13: Starting PM2 Processes"
cd "$APP_DIR"
pm2 start deploy/pm2/ecosystem.config.js
pm2 save
env PATH=$PATH:/usr/bin $(which pm2) startup systemd -u root --hp /root | tail -1 | bash
log "PM2 processes started"

# ─── PHASE 14: Firewall ──────────────────────────────────────────────────────
step "Phase 14: Configuring Firewall"
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
log "Firewall configured"

# ─── DONE ─────────────────────────────────────────────────────────────────────
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              SETUP COMPLETE!                         ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}CREDENTIALS (save these now):${NC}"
echo "  Database Password : $DB_PASS"
echo "  Admin Login       : $ADMIN_EMAIL"
echo "  Admin Password    : $ADMIN_PASS"
echo ""
echo -e "${YELLOW}SERVER IP: $SERVER_IP${NC}"
echo ""
echo -e "${BLUE}NEXT STEPS:${NC}"
echo "  1. Point these DNS A records to $SERVER_IP:"
echo "       reelsoo.com               → $SERVER_IP"
echo "       www.reelsoo.com           → $SERVER_IP"
echo "       api.reelsoo.com           → $SERVER_IP"
echo "       reelsooadmin6784.reelsoo.com → $SERVER_IP"
echo ""
echo "  2. After DNS propagates (5-30 min), run SSL:"
echo "       certbot --nginx -d reelsoo.com -d www.reelsoo.com \\"
echo "         -d api.reelsoo.com -d reelsooadmin6784.reelsoo.com"
echo ""
echo "  3. Add Cloudflare R2 keys to /var/www/reelsoo/server/.env"
echo "     then run: cd /var/www/reelsoo/server && php artisan config:cache"
echo ""
echo "  4. Check status: pm2 status"
echo "═══════════════════════════════════════════════════════"
