# Backend Build Notes – Phase 1

## Overview

Phase 1 establishes the complete Laravel 11 production foundation inside `server/`. No video features are included. The goal is a deployable skeleton that is fully correct, secure, and ready for Phase 2 development.

---

## Architecture Decisions

### Single Login System

There is **one login page** (`/login`) for all roles. Role separation is enforced server-side via `RoleMiddleware`, not separate login URLs. This prevents the classic "admin at /admin-login" security smell.

### Guards

| Guard | Driver   | Used by                          |
|-------|----------|----------------------------------|
| `web` | session  | Website + dashboard (Blade)      |
| `api` | sanctum  | Flutter app (Bearer token)       |

No separate `admin` guard. Role is a column on the `users` table.

### Token Strategy (Sanctum)

- Token name: `flutter-app`
- On new login: all existing `flutter-app` tokens for that user are revoked before issuing a fresh one. This prevents token accumulation from repeated logins on the same device.
- Tokens have no built-in expiry in Phase 1; expiry policy will be added in Phase 9.

### Password Hashing

- The `User` model uses a `HashedCasts` pattern: `password` is cast to `hashed`, so plain-text passwords passed to `User::create()` are automatically hashed by Laravel.

### Middleware Stack

```
web routes    → StartSession, VerifyCsrfToken, ...
auth routes   → auth (Authenticate)
role routes   → auth + RoleMiddleware(roles...)
api routes    → throttle:api
api auth      → auth:sanctum
```

`RoleMiddleware` checks both the user's role AND `is_banned` status. A banned user is logged out immediately on any authenticated request.

---

## File Map

```
server/
├── app/
│   ├── Http/
│   │   ├── Controllers/
│   │   │   ├── Api/
│   │   │   │   ├── Auth/ApiAuthController.php   # Register, login, me, logout
│   │   │   │   └── HealthController.php          # GET /api/v1/health
│   │   │   ├── Dashboard/
│   │   │   │   ├── Admin/
│   │   │   │   │   ├── AdminDashboardController.php
│   │   │   │   │   └── AdminUserController.php   # list, show, ban, unban, promote
│   │   │   │   ├── Creator/CreatorDashboardController.php
│   │   │   │   └── User/UserDashboardController.php
│   │   │   └── Web/
│   │   │       ├── AuthController.php            # Web login/register/logout/reset
│   │   │       └── HomeController.php            # Public website home
│   │   └── Middleware/
│   │       └── RoleMiddleware.php
│   └── Models/User.php
├── bootstrap/app.php                              # Laravel 11 app bootstrap
├── config/
│   ├── auth.php                                   # web + api guards
│   └── sanctum.php
├── database/
│   ├── migrations/
│   │   ├── 0001_01_01_000000_create_users_table.php
│   │   ├── 0001_01_01_000001_create_cache_table.php
│   │   ├── 0001_01_01_000002_create_jobs_table.php
│   │   ├── 0001_01_01_000003_create_sessions_table.php
│   │   └── 0001_01_01_000004_create_personal_access_tokens_table.php
│   └── seeders/DatabaseSeeder.php                 # Seeds admin user from .env
├── resources/
│   ├── css/app.css                                # Tailwind directives + components
│   ├── js/app.js
│   └── views/
│       ├── layouts/
│       │   ├── base.blade.php                     # HTML shell + Vite
│       │   ├── website.blade.php                  # Public nav + footer
│       │   ├── auth.blade.php                     # Centered card
│       │   ├── admin.blade.php                    # Admin sidebar layout
│       │   ├── creator.blade.php                  # Creator sidebar layout
│       │   └── user.blade.php                     # User header layout
│       ├── website/home.blade.php
│       ├── auth/
│       │   ├── login.blade.php
│       │   ├── register.blade.php
│       │   └── forgot-password.blade.php
│       ├── dashboard/
│       │   ├── admin/
│       │   │   ├── index.blade.php
│       │   │   ├── users.blade.php
│       │   │   └── users-show.blade.php
│       │   ├── creator/index.blade.php
│       │   └── user/index.blade.php
│       └── errors/
│           ├── 403.blade.php
│           └── 404.blade.php
├── routes/
│   ├── web.php                                    # Website + auth + dashboard routes
│   ├── api.php                                    # API v1 routes
│   └── console.php                                # Scheduled commands
├── tailwind.config.js
├── vite.config.js
├── postcss.config.js
├── composer.json
├── package.json
└── .env.example
```

---

## Things NOT in Phase 1 (intentional)

- Video upload, processing, storage
- Follow/like/comment system
- Notifications
- Search
- Creator analytics
- Flutter app code
- VPS deployment / CI-CD

---

## Known Limitations to Fix Before Production

1. Password reset requires a mail driver - configure `MAIL_*` in `.env`
2. `ADMIN_PASSWORD` in `.env` must be changed from the default
3. Run `php artisan key:generate` after copying `.env.example`
4. Run `php artisan storage:link` to expose public disk files
5. Supervisor must be configured for `queue:work` before Phase 2 (video processing uses queued jobs)

---

## Next: Phase 2

- Video upload endpoint with S3/R2 storage
- FFmpeg thumbnail generation (queued job)
- Video feed API
- Signed URL delivery for private videos
