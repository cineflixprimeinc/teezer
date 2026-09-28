# Reelsoo – Laravel Backend

Laravel 11 backend powering the Reelsoo platform: REST API for the Flutter mobile app, plus the role-based web dashboard and public website.

---

## Requirements

| Tool       | Version  |
|------------|----------|
| PHP        | ≥ 8.2    |
| Composer   | ≥ 2.6    |
| Node.js    | ≥ 20     |
| MySQL      | ≥ 8.0    |

---

## Local Setup

```bash
# 1. Install PHP dependencies
composer install

# 2. Copy environment file and configure it
cp .env.example .env

# 3. Generate application key
php artisan key:generate

# 4. Create the MySQL database, then run migrations
php artisan migrate --seed

# 5. Create the storage symlink
php artisan storage:link

# 6. Install Node dependencies and build assets
npm install
npm run dev      # development (hot reload)
# or
npm run build    # production build
```

---

## Environment Variables (key ones)

| Variable                  | Description                                  |
|---------------------------|----------------------------------------------|
| `DB_DATABASE`             | MySQL database name                          |
| `DB_USERNAME` / `DB_PASSWORD` | MySQL credentials                        |
| `APP_URL`                 | Full URL of the web app (e.g. `https://yourdomain.com`) |
| `SANCTUM_STATEFUL_DOMAINS`| Domain for Sanctum SPA auth (same as `APP_URL` host) |
| `ADMIN_NAME`              | Seeded admin user display name               |
| `ADMIN_EMAIL`             | Seeded admin user email                      |
| `ADMIN_PASSWORD`          | Seeded admin user password (**change in production**) |
| `QUEUE_CONNECTION`        | Set to `database` in production              |
| `SESSION_DRIVER`          | Set to `database` in production              |

---

## Artisan Commands

```bash
# Run all migrations fresh with seeders
php artisan migrate:fresh --seed

# Clear all caches
php artisan optimize:clear

# Start queue worker (use Supervisor in production)
php artisan queue:work --sleep=3 --tries=3
```

---

## API

- **Base URL:** `https://api.yourdomain.com/api/v1`
- **Auth:** Bearer token via Laravel Sanctum
- **Health check:** `GET /api/v1/health`
- **Register:** `POST /api/v1/auth/register`
- **Login:** `POST /api/v1/auth/login`
- **Me:** `GET /api/v1/auth/me` *(requires token)*

See `docs/api-plan.md` for the full endpoint reference.

---

## Role-Based Dashboard

| Role    | Dashboard URL          |
|---------|------------------------|
| Admin   | `/dashboard/admin`     |
| Creator | `/dashboard/creator`   |
| User    | `/dashboard/user`      |

All roles share a single login at `/login`. After authenticating, users are automatically redirected to their role-appropriate dashboard.

---

## Project Phases

| Phase | Description                       |
|-------|-----------------------------------|
| 1     | Laravel foundation (current)      |
| 2     | Video upload & storage            |
| 3     | Feed algorithm & recommendations  |
| 4     | Social features (follow, comment) |
| 5     | Notifications                     |
| 6     | Search                            |
| 7     | Creator analytics & monetisation  |
| 8     | Flutter app integration           |
| 9     | Production hardening & launch     |

See `docs/project-plan.md` for the full roadmap.
