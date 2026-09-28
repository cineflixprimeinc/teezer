# Teezer - Project Plan

> **Version:** 2.0 - Production development start  
> **Brand Color:** `#fe2c55`

---

## What Is Teezer

Teezer is a short-form video sharing platform. Users upload and discover vertical videos, interact through likes, comments, saves, and follows. Creators manage their content and analytics through a studio dashboard. Admins moderate the platform through an admin dashboard. All three roles share one login page.

---

## Repository Structure

```
teezer/                          ← GitHub repo root
├── mobile-app/                   ← Flutter app (source only, never deployed to VPS)
├── server/                       ← Laravel app (deployed to VPS)
│   ├── app/
│   ├── resources/
│   ├── routes/
│   ├── database/
│   ├── public/                   ← Nginx document root
│   └── storage/app/public/       ← Uploaded media (videos, images)
├── assets/
│   └── design-reference/         ← UI screenshot references
└── docs/                         ← All planning documents
    ├── project-plan.md
    ├── design-plan.md
    ├── database-plan.md
    ├── api-plan.md
    ├── role-based-login-plan.md
    └── deployment-plan.md
```

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Mobile App | Flutter (Dart) | Source in GitHub, distributed as APK/AAB |
| Backend API | Laravel 11 | Hosted on VPS, consumed by Flutter app |
| Role-Based Dashboard | Laravel + Blade + Tailwind CSS | Hosted on VPS, accessed via browser |
| Public Website | Laravel + Blade + Tailwind CSS | Hosted on VPS |
| Database | MySQL 8.0 | On VPS, same instance |
| API Authentication | Laravel Sanctum (token-based) | For Flutter app |
| Web Authentication | Laravel session (cookie-based) | For dashboard & website |
| Push Notifications | Firebase Cloud Messaging | Phase 6+ |
| Media Storage | Local VPS disk → Cloudflare R2 / AWS S3 | Upgrade in Phase 6+ |
| Server OS | Ubuntu 22.04 LTS | |
| Web Server | Nginx | |
| SSL | Let's Encrypt (Certbot) | |
| Queue Worker | Supervisor | |

---

## Hosting Architecture

### What Lives Where

| Component | Where |
|---|---|
| Flutter app source code | GitHub only (`mobile-app/`) |
| Laravel app (API + Dashboard + Website) | VPS - `/var/www/teezer/server` |
| MySQL database | VPS - same machine |
| Uploaded videos, thumbnails, avatars | VPS - `server/storage/app/public/` |
| APK / AAB / IPA build files | Never on VPS, never in GitHub |

### Domain & URL Map

| URL | Purpose |
|---|---|
| `https://yourdomain.com` | Public website |
| `https://yourdomain.com/login` | Single login for all roles |
| `https://yourdomain.com/register` | User signup |
| `https://yourdomain.com/dashboard` | Smart redirect → role dashboard |
| `https://yourdomain.com/dashboard/admin` | Admin dashboard |
| `https://yourdomain.com/dashboard/creator` | Creator Studio dashboard |
| `https://yourdomain.com/dashboard/user` | User home dashboard |
| `https://api.yourdomain.com/api/v1` | REST API for Flutter |
| `https://yourdomain.com/storage` | Public media (videos, images) |

### Single Login System

One login page at `/login` handles all three roles. After authentication, the `RoleMiddleware` reads the user's `role` column and redirects:

```
role = admin    →  /dashboard/admin
role = creator  →  /dashboard/creator
role = user     →  /dashboard/user
```

See `docs/role-based-login-plan.md` for the full implementation plan.

### Nginx (2 blocks, 1 VPS)

- **Block 1:** `yourdomain.com` → serves website + login + all dashboard routes
- **Block 2:** `api.yourdomain.com` → serves REST API with CORS headers

Both blocks point to the same Laravel `public/index.php`. Route separation is handled inside Laravel.

---

## Development Phases

| Phase | Name | Status |
|---|---|---|
| 1 | Planning & Documentation | ✅ Done |
| 2 | Flutter UI (dummy data) | Pending |
| 3 | Laravel Project Setup | Pending |
| 4 | Database Migrations & Models | Pending |
| 5 | REST API Endpoints | Pending |
| 6 | Flutter + API Integration | Pending |
| 7 | Role-Based Web Dashboard | Pending |
| 8 | Public Website | Pending |
| 9 | VPS Deployment | Pending |

---

### PHASE 1 - Planning & Documentation ✅

Files created:
- `docs/project-plan.md`
- `docs/design-plan.md`
- `docs/database-plan.md`
- `docs/api-plan.md`
- `docs/role-based-login-plan.md`
- `docs/deployment-plan.md`
- `.gitignore`

---

### PHASE 2 - Flutter UI (Dummy Data Only)

Build all Flutter screens using hardcoded dummy data. No backend connection.

**Output:** Complete Flutter UI inside `mobile-app/lib/`

**Flutter folder structure:**
```
mobile-app/lib/
├── main.dart
├── app/
│   ├── app.dart            ← MaterialApp + ThemeData
│   └── routes.dart         ← Named route map
├── theme/
│   ├── app_colors.dart
│   ├── app_text_styles.dart
│   └── app_theme.dart
├── models/                 ← Data models (dummy-compatible)
├── screens/
│   ├── splash/
│   ├── auth/               ← login, signup, forgot_password
│   ├── feed/               ← home_feed
│   ├── explore/
│   ├── audio/
│   ├── upload/
│   ├── friends/
│   ├── inbox/
│   ├── notifications/
│   ├── profile/            ← user_profile, profile_actions
│   ├── settings/
│   └── studio/             ← dashboard, content, analytics
├── widgets/                ← Shared reusable widgets
└── utils/
    ├── constants.dart
    └── dummy_data.dart
```

**Screens to build:**
1. SplashScreen
2. LoginScreen
3. SignupScreen
4. HomeFeedScreen (full-screen vertical swipeable feed)
5. ExploreScreen
6. AudioScreen
7. UploadVideoScreen
8. FriendsScreen
9. InboxScreen
10. NotificationsScreen
11. UserProfileScreen
12. ProfileActionsScreen
13. SettingsScreen
14. TeezerStudioDashboardScreen
15. StudioContentScreen
16. StudioAnalyticsScreen

---

### PHASE 3 - Laravel Project Setup

Create the Laravel 11 project inside `server/`. Configure for both API and web usage.

**Tasks:**
- `composer create-project laravel/laravel server`
- Install Laravel Sanctum for API token auth
- Install and configure Tailwind CSS (for dashboard and website)
- Set up `config/database.php` for MySQL
- Scaffold directory structure:
  - `app/Http/Controllers/Api/` - Flutter API controllers
  - `app/Http/Controllers/Web/` - Website controllers
  - `app/Http/Controllers/Dashboard/` - Role dashboard controllers
  - `app/Http/Middleware/` - RoleMiddleware, EnsureEmailVerified
  - `resources/views/website/` - Public website Blade views
  - `resources/views/auth/` - Login/register/forgot Blade views
  - `resources/views/dashboard/admin/` - Admin views
  - `resources/views/dashboard/creator/` - Creator views
  - `resources/views/dashboard/user/` - User views
- Set up `routes/api.php` and `routes/web.php`
- Create `.env.example` with all required keys
- Add `server/` to `.gitignore` exclusions properly

---

### PHASE 4 - Database Migrations & Models

Create all migrations, Eloquent models, relationships, factories, and seeders.

**Key tables (see `docs/database-plan.md`):**
- `users`, `profiles`, `videos`
- `video_likes`, `video_comments`, `comment_likes`
- `video_saves`, `video_shares`, `video_views`
- `followers`, `blocked_users`
- `hashtags`, `video_hashtags`, `audio_tracks`
- `video_reports`, `user_reports`
- `notifications`, `user_devices`
- `verification_requests`
- `creator_levels`, `creator_progress`, `creator_analytics`
- `wallets`, `wallet_transactions`, `subscriptions`
- `social_links`, `highlights`

**Seeders:**
- `CreatorLevelSeeder` - 5 levels with XP thresholds
- `AdminUserSeeder` - 1 superadmin account
- `DemoDataSeeder` - 5 users, videos, follows, likes (development only)

---

### PHASE 5 - REST API Endpoints

Build all API endpoints consumed by the Flutter app. See `docs/api-plan.md`.

**Endpoint groups:**
- Auth (`/auth/*`) - register, login, logout, me, forgot/reset password
- Profile (`/profile/*`) - get, update, avatar, social links, highlights
- Videos (`/videos/*`) - feed, trending, upload, update, delete, view
- Interactions - like, save, share, comment, comment-like
- Follow (`/users/{username}/follow`)
- Explore (`/explore/*`) - trending, search, hashtags
- Notifications (`/notifications/*`)
- Reports (`/reports/*`)
- Block (`/users/{username}/block`)
- Studio (`/studio/*`) - dashboard, analytics, content, monetization, creator level
- Verification (`/verification/*`)
- Audio (`/audio/*`)
- Wallet (`/wallet/*`)
- Devices (`/devices/*`)

---

### PHASE 6 - Flutter + API Integration

Connect Flutter app to the Laravel API. Replace all dummy data with real API calls.

**Tasks:**
- Add HTTP client (`dio` or `http` package)
- Implement `ApiService` base class with auth header injection
- Implement per-feature service classes: `AuthService`, `VideoService`, `ProfileService`, etc.
- Add `SharedPreferences` for token storage
- Implement state management (Provider or Riverpod)
- Handle loading states, error states, pagination
- Implement local token refresh and logout on 401

---

### PHASE 7 - Role-Based Web Dashboard

Build the web dashboard system under `yourdomain.com/dashboard`. Uses Laravel Blade + Tailwind CSS. Session-based auth.

**Route prefix structure:**
- `/login` - shared login page
- `/dashboard/admin/*` - admin only
- `/dashboard/creator/*` - creator only
- `/dashboard/user/*` - user only
- `/dashboard` - smart redirect based on role

**Admin Dashboard pages:**
- Overview stats
- User management (list, view, ban, unban, promote)
- Video management (list, view, remove, flag)
- Video reports queue (review, action, dismiss)
- User reports queue
- Verification requests (approve, reject)
- Platform analytics
- Settings

**Creator Studio pages:**
- Studio dashboard (views, watch time, followers, earnings)
- Content management (list, edit, delete, schedule, publish)
- Analytics (charts: views, watch time, followers, engagement)
- Monetization (wallet, gift earnings, subscriptions)
- Verification center (submit/check status)
- Settings

**User Dashboard pages:**
- Home (account overview)
- Saved videos
- Watch history
- Drafts
- Account settings

---

### PHASE 8 - Public Website

Build the Laravel Blade public website at `yourdomain.com`.

**Pages:**
- `/` - Landing page (hero, features, app download CTA, screenshots)
- `/about` - About Teezer
- `/download` - App download (Android APK / Play Store / App Store links)
- `/privacy` - Privacy Policy
- `/terms` - Terms & Conditions
- `/contact` - Contact form

---

### PHASE 9 - VPS Deployment

Execute the production deployment documented in `docs/deployment-plan.md`.

**Steps:**
1. VPS initial setup (Ubuntu 22.04, Nginx, PHP 8.2, MySQL 8, Composer)
2. MySQL database and user creation
3. Clone repo, `composer install`, `php artisan migrate`, `storage:link`
4. Configure `.env` with production values
5. Set up Nginx (2 server blocks)
6. Issue SSL certificates via Certbot
7. Configure DNS records (A records for `@`, `www`, `api`)
8. Set up Supervisor queue workers
9. Set up `deploy.sh` script
10. Security hardening checklist

---

## Mobile App Screen List

| Screen | Route Name | Description |
|---|---|---|
| SplashScreen | `/` | Logo + animated loading dots |
| LoginScreen | `/login` | Email/password + social login |
| SignupScreen | `/signup` | Full registration form |
| HomeFeedScreen | `/feed` | Full-screen vertical video feed |
| ExploreScreen | `/explore` | Trending videos and users |
| AudioScreen | `/audio` | Trending audio tracks |
| UploadVideoScreen | `/upload` | Upload video with caption/tags/music |
| FriendsScreen | `/friends` | Friend suggestions and activity |
| InboxScreen | `/inbox` | DM inbox |
| NotificationsScreen | `/notifications` | Activity notifications |
| UserProfileScreen | `/profile/:username` | Public profile with video grid |
| ProfileActionsScreen | `/profile/actions` | Share, library, safety shortcuts |
| SettingsScreen | `/settings` | Full settings page |
| TeezerStudioDashboardScreen | `/studio` | Creator Studio main dashboard |
| StudioContentScreen | `/studio/content` | Video content management |
| StudioAnalyticsScreen | `/studio/analytics` | Analytics charts |

---

## Naming Conventions

| Context | Convention |
|---|---|
| Flutter files | `snake_case.dart` |
| Flutter classes | `PascalCase` |
| Flutter variables | `camelCase` |
| Laravel models | `StudlyCase` (e.g., `VideoLike`) |
| Laravel controllers | `StudlyCase` + `Controller` suffix |
| Laravel migrations | `snake_case` timestamp prefix |
| Database columns | `snake_case` |
| API routes | `kebab-case` (`/api/v1/video-feed`) |
| Blade views | `snake_case.blade.php` |

---

## Git Commit Format

```
[PHASE-X] Short description

- detail 1
- detail 2
```

**Rules:**
- Never commit `.env` files
- Never commit `vendor/`, `build/`, `*.apk`, `*.aab`
- Push after every completed phase
- One commit per phase minimum
