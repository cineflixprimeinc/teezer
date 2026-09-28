# Teezer - Deployment Plan

> **Status:** Planning only. Execute during Phase 9.  
> **Version:** 2.0 - Production hosting on own VPS with custom domain.

---

## What Lives on the VPS

| Component | On VPS |
|---|---|
| Laravel app (API + Dashboard + Website) | Yes - `/var/www/teezer/server` |
| MySQL 8 database | Yes - same machine |
| Uploaded videos, thumbnails, avatars, documents | **No - Cloudflare R2 object storage** |
| Nginx web server | Yes |
| SSL certificates | Yes - Let's Encrypt |
| Queue workers | Yes - Supervisor |
| Flutter app source code | **No - GitHub only** |
| APK / AAB / IPA build files | **No - never on VPS or GitHub** |

The repo is cloned to the VPS. The `mobile-app/` folder is present in the clone but never served or used on the VPS - only `server/` is executed.

---

## Server Specs (Minimum for Launch)

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1 GB | 2 GB |
| Disk | 20 GB SSD | 50 GB SSD |
| Bandwidth | 1 TB/mo | 2 TB/mo |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

Providers: DigitalOcean, Linode, Vultr, Hetzner, AWS Lightsail.

---

## Software Stack on VPS

| Software | Version | Purpose |
|---|---|---|
| Ubuntu | 22.04 LTS | OS |
| Nginx | Latest stable | Web server |
| PHP | 8.2 | Runtime |
| php8.2-fpm | Matching | FastCGI process manager |
| MySQL | 8.0 | Database |
| Composer | 2.x | PHP dependency manager |
| Certbot | Latest | SSL certificate issuer |
| Supervisor | Latest | Queue worker process manager |
| UFW | Built-in | Firewall |
| fail2ban | Latest | Brute-force protection |

---

## Domain & URL Structure

Replace `teezer.live` with your actual registered domain.

| URL | Purpose | Nginx Block |
|---|---|---|
| `https://teezer.live` | **Temporary "Coming Soon" landing page** (replaced with full site later) | Block 1 |
| `https://teezer.live/login` | Single login page for all roles (admin, creator, user) | Block 1 |
| `https://teezer.live/register` | User registration | Block 1 |
| `https://teezer.live/dashboard` | Smart redirect → sends each role to their dashboard | Block 1 |
| `https://teezer.live/dashboard/admin` | Admin-only dashboard (redirects non-admins away) | Block 1 |
| `https://teezer.live/dashboard/creator` | Creator Studio (creator + admin only) | Block 1 |
| `https://teezer.live/dashboard/user` | User dashboard (all authenticated roles) | Block 1 |
| `https://media.teezer.live` | Cloudflare R2 CDN - all uploaded media | R2 Custom Domain |
| `https://api.teezer.live/api/v1` | REST API for Flutter app | Block 2 |

> **Routing rules:**
> - `teezer.live` is the public website - the admin panel is **never** the homepage.
> - After login, the server checks `user.role` and redirects: `admin` → `/dashboard/admin`, `creator` → `/dashboard/creator`, `user` → `/dashboard/user`.
> - If a non-admin navigates directly to `/dashboard/admin`, they are redirected back to their own dashboard with an error message.

---

## DNS Records (Cloudflare)

DNS is managed via **Cloudflare**. All records point to VPS IP `<SOURCE_HOST5_IP>`.

### Cloudflare DNS Setup Steps

1. Log in to Cloudflare → Select the `teezer.live` zone
2. Go to **DNS → Records**
3. Add these records:

| Type | Name | Content | Proxy | TTL |
|------|------|---------|-------|-----|
| A | `@` | `<SOURCE_HOST5_IP>` | Proxied ☁️ | Auto |
| A | `www` | `<SOURCE_HOST5_IP>` | Proxied ☁️ | Auto |
| A | `api` | `<SOURCE_HOST5_IP>` | Proxied ☁️ | Auto |

> **Proxy = Enabled (☁️)**: Traffic flows through Cloudflare CDN - you get DDoS protection, caching, and your real VPS IP is hidden. This is the recommended setting.

> **SSL/TLS mode in Cloudflare:** Set to **Full (Strict)** after Let's Encrypt SSL is installed on the VPS. This ensures end-to-end encryption between Cloudflare and your VPS.

### Cloudflare Page Rules (Optional but Recommended)

| Pattern | Setting |
|---------|---------|
| `api.teezer.live/*` | Cache Level: Bypass (API responses must not be cached by Cloudflare) |
| `media.teezer.live/*` | R2 custom domain - Cloudflare handles CDN caching automatically |
| `teezer.live/build/*` | Cache Level: Cache Everything, Edge TTL: 30 days |

### Cloudflare Security Settings

- **SSL/TLS:** Full (Strict)
- **Always Use HTTPS:** On
- **HSTS:** Enabled (max-age 1 year, include subdomains)
- **Minimum TLS Version:** TLS 1.2
- **Bot Fight Mode:** On
- **Security Level:** Medium

---

## VPS Directory Layout

```
/var/www/teezer/                         ← Git repo root
├── server/                               ← Laravel application
│   ├── app/
│   │   ├── Http/
│   │   │   ├── Controllers/
│   │   │   │   ├── Api/                  ← Flutter API controllers
│   │   │   │   ├── Web/                  ← Website + auth controllers
│   │   │   │   └── Dashboard/
│   │   │   │       ├── Admin/            ← Admin dashboard controllers
│   │   │   │       ├── Creator/          ← Creator Studio controllers
│   │   │   │       └── User/             ← User dashboard controllers
│   │   │   └── Middleware/
│   │   │       └── RoleMiddleware.php
│   │   └── Models/
│   ├── resources/views/
│   │   ├── layouts/                      ← base, admin, creator, user, website
│   │   ├── auth/                         ← login, register, forgot-password
│   │   ├── website/                      ← home, about, download, privacy, terms, contact
│   │   ├── dashboard/
│   │   │   ├── admin/
│   │   │   ├── creator/
│   │   │   └── user/
│   │   └── components/
│   ├── routes/
│   │   ├── api.php                       ← /api/v1/* (Sanctum token auth)
│   │   └── web.php                       ← website + login + dashboard (session auth)
│   ├── database/
│   │   ├── migrations/
│   │   └── seeders/
│   ├── public/                           ← Nginx document root
│   │   ├── index.php
│   │   └── storage → ../storage/app/public   ← symlink (php artisan storage:link)
│   ├── storage/app/public/               ← Only used when FILESYSTEM_DISK=public (local dev)
│   │   ├── videos/                       ← Dev: local video files
│   │   ├── thumbnails/                   ← Dev: local thumbnails
│   │   └── avatars/                      ← Dev: local profile pictures
│   └── .env                              ← Production secrets (NOT in Git)
├── mobile-app/                           ← Flutter source (present but unused on VPS)
├── docs/
├── deploy.sh                             ← Deployment script
└── .gitignore
```

---

## Step 1 - VPS Initial Setup

SSH into your VPS as root or a sudo user:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install essentials
sudo apt install -y git curl unzip software-properties-common supervisor ufw fail2ban

# Install PHP 8.2
sudo add-apt-repository ppa:ondrej/php -y
sudo apt update
sudo apt install -y php8.2 php8.2-fpm php8.2-mysql php8.2-mbstring \
  php8.2-xml php8.2-curl php8.2-zip php8.2-bcmath php8.2-gd \
  php8.2-tokenizer php8.2-intl php8.2-fileinfo php8.2-redis

# Verify PHP
php -v

# Install Composer
curl -sS https://getcomposer.org/installer | php
sudo mv composer.phar /usr/local/bin/composer
composer --version

# Install Nginx
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx

# Install MySQL 8
sudo apt install -y mysql-server
sudo systemctl enable mysql
sudo mysql_secure_installation
```

---

## Step 2 - Create Non-Root Sudo User (Recommended)

```bash
adduser deploy
usermod -aG sudo deploy

# Copy SSH keys to new user
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy

# From this point, SSH as 'deploy' instead of root
```

---

## Step 3 - MySQL Database Setup

```bash
sudo mysql -u root -p
```

```sql
CREATE DATABASE teezer
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER 'teezer_user'@'localhost' IDENTIFIED BY 'USE_A_STRONG_RANDOM_PASSWORD';
GRANT ALL PRIVILEGES ON teezer.* TO 'teezer_user'@'localhost';
FLUSH PRIVILEGES;
SHOW DATABASES;
EXIT;
```

> The password here goes into the `.env` file's `DB_PASSWORD`. Never commit it to Git.

---

## Step 4 - Clone Repo & Deploy Laravel

```bash
# Set up web directory
sudo mkdir -p /var/www/teezer
sudo chown deploy:deploy /var/www/teezer

# Clone the full repo
cd /var/www/teezer
git clone <REPOSITORY_URL> .

# Enter the Laravel app
cd /var/www/teezer/server

# Install dependencies (production only)
composer install --optimize-autoloader --no-dev

# Create .env from example
cp .env.example .env
nano .env           # ← Fill in all production values (see Step 5)

# Generate app key
php artisan key:generate

# Run migrations + seeders
php artisan migrate --force
php artisan db:seed --class=CreatorLevelSeeder --force
php artisan db:seed --class=GiftSeeder --force
php artisan db:seed --class=AdminUserSeeder --force

# Create storage symlink
php artisan storage:link

# Build optimized caches
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Permissions
sudo chown -R www-data:www-data /var/www/teezer/server
sudo chmod -R 755 /var/www/teezer/server
sudo chmod -R 775 /var/www/teezer/server/storage
sudo chmod -R 775 /var/www/teezer/server/bootstrap/cache
```

---

## Step 5 - Production `.env`

Edit `/var/www/teezer/server/.env`:

```dotenv
# ── Application ─────────────────────────────────────
APP_NAME=Teezer
APP_ENV=production
APP_KEY=base64:GENERATED_BY_KEY_GENERATE
APP_DEBUG=false
APP_URL=https://teezer.live

# ── Logging ─────────────────────────────────────────
LOG_CHANNEL=daily
LOG_LEVEL=error

# ── Database ─────────────────────────────────────────
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=teezer
DB_USERNAME=teezer_user
DB_PASSWORD=USE_A_STRONG_RANDOM_PASSWORD

# ── Cache / Session / Queue ──────────────────────────
CACHE_DRIVER=file
SESSION_DRIVER=database
SESSION_LIFETIME=120
SESSION_DOMAIN=teezer.live
SESSION_SECURE_COOKIE=true
QUEUE_CONNECTION=database

# ── Sanctum (Flutter API token auth) ────────────────
SANCTUM_STATEFUL_DOMAINS=teezer.live,www.teezer.live

# ── Storage: Cloudflare R2 ───────────────────────────
# All uploads (videos, thumbnails, avatars, documents) go to R2.
# Never commit real values. Never expose keys to the Flutter app.
FILESYSTEM_DISK=r2
CLOUDFLARE_R2_ACCESS_KEY_ID=YOUR_R2_ACCESS_KEY_ID
CLOUDFLARE_R2_SECRET_ACCESS_KEY=YOUR_R2_SECRET_KEY
CLOUDFLARE_R2_BUCKET=teezer-media
CLOUDFLARE_R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
CLOUDFLARE_R2_URL=https://media.teezer.live
CLOUDFLARE_R2_REGION=auto

# ── Firebase Push Notifications (Phase 6+) ───────────
# FIREBASE_CREDENTIALS=/var/www/teezer/server/storage/app/firebase-credentials.json
# FIREBASE_PROJECT_ID=

# ── Mail ─────────────────────────────────────────────
MAIL_MAILER=smtp
MAIL_HOST=smtp.mailgun.org
MAIL_PORT=587
MAIL_USERNAME=
MAIL_PASSWORD=
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS=noreply@teezer.live
MAIL_FROM_NAME="Teezer"

# ── Admin Seeder (used by AdminUserSeeder) ────────────
ADMIN_NAME="Teezer Admin"
ADMIN_EMAIL=admin@teezer.live
ADMIN_PASSWORD=CHANGE_THIS_IMMEDIATELY_AFTER_SEEDING
```

---

## Step 6 - Nginx Configuration

### Block 1 - Main Domain (Website + Dashboard + Login)

**`/etc/nginx/sites-available/teezer`**

```nginx
server {
    listen 80;
    server_name teezer.live www.teezer.live;
    root /var/www/teezer/server/public;
    index index.php index.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy "strict-origin-when-cross-origin";

    # Large upload support for video files
    client_max_body_size 500M;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.2-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
        fastcgi_read_timeout 300;
    }

    # Static files - long cache
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff2|webp|svg)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    # Video streaming - enable byte-range for seek support
    location ~* \.(mp4|webm|mov)$ {
        expires 7d;
        add_header Accept-Ranges bytes;
        add_header Cache-Control "public";
    }

    # Block dot files
    location ~ /\.(?!well-known).* {
        deny all;
    }
}
```

### Block 2 - API Subdomain (Flutter REST API)

**`/etc/nginx/sites-available/teezer-api`**

```nginx
server {
    listen 80;
    server_name api.teezer.live;
    root /var/www/teezer/server/public;
    index index.php;

    add_header X-Content-Type-Options "nosniff";

    # Accept large video uploads from Flutter app
    client_max_body_size 500M;

    # CORS for Flutter app
    add_header Access-Control-Allow-Origin "*" always;
    add_header Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Authorization, Content-Type, Accept, X-App-Version" always;

    location / {
        if ($request_method = OPTIONS) {
            return 204;
        }
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.2-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
        fastcgi_read_timeout 300;
    }

    location ~ /\.(?!well-known).* {
        deny all;
    }
}
```

### Enable Both Sites

```bash
sudo ln -s /etc/nginx/sites-available/teezer /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/teezer-api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

---

## Step 7 - SSL with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx

# Issue certificates for both domains
sudo certbot --nginx -d teezer.live -d www.teezer.live
sudo certbot --nginx -d api.teezer.live

# Certbot auto-updates the Nginx configs to add SSL and redirect HTTP → HTTPS

# Test renewal
sudo certbot renew --dry-run

# Enable timer for auto-renewal
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

After this step, add HSTS header to both Nginx blocks (inside the `listen 443 ssl` block that Certbot added):

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

---

## Step 8 - Supervisor Queue Worker

**`/etc/supervisor/conf.d/teezer-worker.conf`**

```ini
[program:teezer-worker]
process_name=%(program_name)s_%(process_num)02d
command=php /var/www/teezer/server/artisan queue:work database --sleep=3 --tries=3 --max-time=3600
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
user=www-data
numprocs=2
redirect_stderr=true
stdout_logfile=/var/www/teezer/server/storage/logs/worker.log
stopwaitsecs=3600
```

```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start teezer-worker:*
sudo supervisorctl status
```

---

## Step 9 - GitHub Deployment Script

**`/var/www/teezer/deploy.sh`**

```bash
#!/bin/bash
set -e

echo "=== Teezer Deployment ==="
cd /var/www/teezer

echo "[1/8] Pulling latest code..."
git pull origin main

echo "[2/8] Installing PHP dependencies..."
cd server
composer install --optimize-autoloader --no-dev

echo "[3/8] Running database migrations..."
php artisan migrate --force

echo "[4/8] Clearing caches..."
php artisan config:clear
php artisan route:clear
php artisan view:clear

echo "[5/8] Rebuilding caches..."
php artisan config:cache
php artisan route:cache
php artisan view:cache

echo "[6/8] Restarting queue workers..."
php artisan queue:restart

echo "[7/8] Setting permissions..."
sudo chown -R www-data:www-data /var/www/teezer/server
sudo chmod -R 755 /var/www/teezer/server
sudo chmod -R 775 /var/www/teezer/server/storage
sudo chmod -R 775 /var/www/teezer/server/bootstrap/cache

echo "[8/8] Reloading Nginx..."
sudo systemctl reload nginx

echo "=== Done. Deployment complete. ==="
```

```bash
chmod +x /var/www/teezer/deploy.sh
```

**Run on every new deployment:**
```bash
cd /var/www/teezer && ./deploy.sh
```

---

## Step 10 - Flutter API URL Setup

In `mobile-app/lib/utils/constants.dart`:

```dart
class AppConstants {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://api.teezer.live/api/v1',
  );
}
```

**Flutter run commands:**
```bash
# Local development
flutter run --dart-define=API_BASE_URL=http://192.168.x.x:8000/api/v1

# Production APK
flutter build apk --release \
  --dart-define=API_BASE_URL=https://api.teezer.live/api/v1

# Production App Bundle (Play Store)
flutter build appbundle --release \
  --dart-define=API_BASE_URL=https://api.teezer.live/api/v1
```

---

## Step 11 - Media Storage Plan

All uploaded media is stored in **Cloudflare R2** from launch. No user-uploaded files are written to the VPS disk.

### R2 Bucket Layout

```
teezer-media/
├── videos/YYYY/MM/        # UUID-named .mp4 files
├── images/YYYY/MM/        # Thumbnails, avatars, cover images (UUID-named)
└── documents/YYYY/MM/     # Verification documents (UUID-named)
```

### How It Works

- Laravel's `StorageService` calls `Storage::disk('r2')->putFileAs(...)` for every upload.
- MySQL stores only the R2 object **key** (e.g. `videos/2026/05/uuid.mp4`), not the full URL.
- At API response time, `Storage::disk('r2')->url($key)` generates the CDN URL (`https://media.teezer.live/...`).
- Switching back to local disk for dev/testing: set `FILESYSTEM_DISK=public` in `.env`.

### Required `.env` on Production

```dotenv
FILESYSTEM_DISK=r2
CLOUDFLARE_R2_ACCESS_KEY_ID=YOUR_KEY
CLOUDFLARE_R2_SECRET_ACCESS_KEY=YOUR_SECRET
CLOUDFLARE_R2_BUCKET=teezer-media
CLOUDFLARE_R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
CLOUDFLARE_R2_URL=https://media.teezer.live
CLOUDFLARE_R2_REGION=auto
```

### Security

- R2 credentials are **never** sent to Flutter or any client. All uploads go through the Laravel API.
- Laravel validates file type (MIME), file size, and ownership before any write to R2.
- Verification documents use presigned/temporary URLs when served - they are never publicly listed.
- The R2 bucket has no public `s3:GetObject` policy; public access is served through the `media.teezer.live` custom domain only.

---

## Security Checklist

### SSH & Server Hardening
- [ ] Non-root sudo user created (`deploy`)
- [ ] SSH key authentication only: `PasswordAuthentication no` in `/etc/ssh/sshd_config`
- [ ] Root login disabled: `PermitRootLogin no`
- [ ] UFW firewall enabled:
  ```bash
  sudo ufw allow OpenSSH
  sudo ufw allow 'Nginx Full'
  sudo ufw enable
  ```
- [ ] fail2ban active: `sudo systemctl enable fail2ban`
- [ ] MySQL not accessible from outside: `bind-address = 127.0.0.1` (default)

### Laravel Production
- [ ] `APP_DEBUG=false`
- [ ] `APP_ENV=production`
- [ ] `.env` not tracked in Git (in `.gitignore`)
- [ ] Nginx `root` is `public/` - `.env` and app code are not web-accessible
- [ ] `storage/` and `bootstrap/cache/` are not directly accessible via Nginx
- [ ] API rate limiting applied per endpoint group
- [ ] Sanctum token expiry set (default: no expiry - configure in `config/sanctum.php`)
- [ ] Login rate limiting (10 req/min per IP on `/login` route)
- [ ] Uploaded files stored with UUID names, not original filenames
- [ ] File MIME type validated server-side (not just extension)

### SSL
- [ ] HTTPS active on both domains
- [ ] HTTP redirects to HTTPS (Certbot configures this)
- [ ] HSTS header added after SSL confirmed stable
- [ ] Auto-renewal timer running: `systemctl status certbot.timer`

### Database
- [ ] `mysql_secure_installation` completed
- [ ] `root` MySQL account has strong password
- [ ] Dedicated `teezer_user` with database-scoped privileges only
- [ ] Daily backup scheduled (see below)

### Backups
Set up a daily MySQL backup cron:

```bash
crontab -e
```

Add:
```cron
0 2 * * * mysqldump -u teezer_user -p'DB_PASSWORD' teezer | gzip > /var/backups/teezer_$(date +\%Y\%m\%d).sql.gz
# Keep only last 14 days
0 3 * * * find /var/backups -name "teezer_*.sql.gz" -mtime +14 -delete
```

---

## Post-Deploy Verification Checklist

- [ ] `curl https://api.teezer.live/api/v1/health` → returns `{"success":true}`
- [ ] `https://teezer.live` loads the public website
- [ ] `https://teezer.live/login` loads the login page
- [ ] Login as admin → redirects to `/dashboard/admin`
- [ ] Login as creator → redirects to `/dashboard/creator`
- [ ] Login as user → redirects to `/dashboard/user`
- [ ] Visiting `/dashboard/admin` while logged in as user/creator → 403
- [ ] Flutter app connects to `api.teezer.live` (test with Postman or the app)
- [ ] Video upload works (check storage permissions)
- [ ] SSL padlock visible on all domains
- [ ] Queue worker running: `sudo supervisorctl status`
- [ ] Nginx error log clean: `sudo tail /var/log/nginx/error.log`
- [ ] Laravel log clean: `tail /var/www/teezer/server/storage/logs/laravel.log`
