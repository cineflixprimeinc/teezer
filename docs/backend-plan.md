# Teezer - Backend Architecture Plan

> **Domain:** teezer.live  
> **API:** api.teezer.live  
> **VPS:** <SOURCE_HOST5_IP> (Ubuntu 22.04)  
> **Stack:** Laravel 11 · MySQL 8 · Sanctum · Tailwind CSS · Nginx · Supervisor

---

## System Overview

The backend serves **three consumer systems** from a single Laravel application:

| Consumer | Entry Point | Auth Method |
|----------|-------------|-------------|
| Flutter mobile app | `api.teezer.live/api/v1/*` | Sanctum Bearer token |
| Admin panel | `teezer.live/dashboard/admin/*` | Session (web guard) |
| Creator studio | `teezer.live/dashboard/creator/*` | Session (web guard) |

One codebase, one database, one deployment.

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Laravel | 11.x |
| Language | PHP | 8.2 |
| Database | MySQL | 8.0 |
| API Auth | Laravel Sanctum | 4.x |
| Web Auth | Laravel Session (web guard) | - |
| Queue | Laravel Queue (database driver → Redis Phase 6) | - |
| Cache | File (→ Redis Phase 6) | - |
| File Storage | Local disk `storage/app/public` (→ Cloudflare R2 Phase 6) | - |
| Frontend (admin) | Blade + Tailwind CSS 3 + Alpine.js | - |
| Process Manager | Supervisor | - |
| Web Server | Nginx + PHP 8.2-FPM | - |
| SSL | Let's Encrypt via Certbot | - |
| DNS | Cloudflare | - |

---

## Directory Structure

```
server/
├── app/
│   ├── Http/
│   │   ├── Controllers/
│   │   │   ├── Api/                      ← Flutter REST API controllers
│   │   │   │   ├── Auth/
│   │   │   │   │   ├── ApiAuthController.php
│   │   │   │   │   └── PasswordResetController.php
│   │   │   │   ├── Admin/
│   │   │   │   │   └── AdminApiController.php  ← Phase 5
│   │   │   │   ├── Studio/
│   │   │   │   │   ├── StudioDashboardController.php
│   │   │   │   │   ├── StudioAnalyticsController.php
│   │   │   │   │   └── StudioContentController.php
│   │   │   │   ├── ProfileController.php
│   │   │   │   ├── UserController.php
│   │   │   │   ├── VideoController.php
│   │   │   │   ├── VideoInteractionController.php
│   │   │   │   ├── CommentController.php
│   │   │   │   ├── FollowController.php
│   │   │   │   ├── BlockController.php
│   │   │   │   ├── ExploreController.php
│   │   │   │   ├── AudioController.php
│   │   │   │   ├── NotificationController.php
│   │   │   │   ├── VerificationController.php
│   │   │   │   ├── WalletController.php
│   │   │   │   ├── DeviceController.php
│   │   │   │   └── HealthController.php
│   │   │   ├── Dashboard/                ← Web dashboard controllers
│   │   │   │   ├── Admin/
│   │   │   │   │   ├── AdminDashboardController.php
│   │   │   │   │   ├── AdminUserController.php
│   │   │   │   │   ├── AdminVideoController.php
│   │   │   │   │   ├── AdminReportController.php
│   │   │   │   │   ├── AdminVerificationController.php
│   │   │   │   │   ├── AdminAnalyticsController.php
│   │   │   │   │   └── AdminSettingsController.php
│   │   │   │   ├── Creator/
│   │   │   │   │   ├── CreatorDashboardController.php
│   │   │   │   │   ├── CreatorContentController.php
│   │   │   │   │   ├── CreatorAnalyticsController.php
│   │   │   │   │   ├── CreatorMonetizationController.php
│   │   │   │   │   ├── CreatorVerificationController.php
│   │   │   │   │   └── CreatorSettingsController.php
│   │   │   │   └── User/
│   │   │   │       ├── UserDashboardController.php
│   │   │   │       ├── UserSavedController.php
│   │   │   │       ├── UserHistoryController.php
│   │   │   │       └── UserSettingsController.php
│   │   │   └── Web/
│   │   │       ├── AuthController.php    ← Web login/logout/register
│   │   │       └── HomeController.php    ← Public landing page
│   │   ├── Middleware/
│   │   │   └── RoleMiddleware.php
│   │   └── Requests/                     ← Form request validators (Phase 2+)
│   │       ├── Auth/RegisterRequest.php
│   │       ├── Auth/LoginRequest.php
│   │       ├── Video/StoreVideoRequest.php
│   │       └── Video/UpdateVideoRequest.php
│   ├── Models/
│   │   ├── User.php
│   │   ├── Video.php
│   │   ├── VideoComment.php
│   │   ├── VideoLike.php
│   │   ├── VideoSave.php
│   │   ├── VideoShare.php
│   │   ├── VideoView.php
│   │   ├── VideoReport.php
│   │   ├── UserReport.php
│   │   ├── Follower.php            ← Phase 5
│   │   ├── BlockedUser.php         ← Phase 5
│   │   ├── AdminActionLog.php      ← Phase 5
│   │   ├── AppSetting.php          ← Phase 5
│   │   ├── Hashtag.php
│   │   ├── AudioTrack.php
│   │   ├── AppNotification.php
│   │   ├── UserDevice.php
│   │   ├── VerificationRequest.php
│   │   ├── Profile.php
│   │   ├── SocialLink.php
│   │   ├── Highlight.php
│   │   ├── CreatorLevel.php
│   │   ├── CreatorProgress.php
│   │   ├── CreatorAnalytic.php
│   │   ├── Wallet.php
│   │   ├── WalletTransaction.php
│   │   ├── Gift.php
│   │   ├── GiftTransaction.php
│   │   └── Subscription.php
│   ├── Http/
│   │   └── Resources/                    ← API Resources (Phase 5)
│   │       ├── VideoResource.php
│   │       ├── UserResource.php
│   │       ├── CommentResource.php
│   │       └── NotificationResource.php
│   ├── Services/                          ← Business logic layer
│   │   ├── VideoService.php              ← Phase 5: full implementation
│   │   ├── FeedService.php               ← Phase 5: engagement score algorithm
│   │   ├── NotificationService.php       ← Phase 5: push + in-app
│   │   ├── StorageService.php            ← Phase 5: local disk, R2-ready
│   │   ├── AnalyticsService.php
│   │   └── WalletService.php
│   ├── Jobs/                              ← Queued background jobs
│   │   ├── ProcessVideoThumbnail.php
│   │   ├── SendPushNotification.php
│   │   ├── AggregateCreatorAnalytics.php
│   │   └── PurgeExpiredTokens.php
│   ├── Observers/                         ← Model event listeners
│   │   ├── VideoObserver.php
│   │   ├── VideoLikeObserver.php
│   │   └── FollowerObserver.php
│   └── Providers/
│       └── AppServiceProvider.php
├── bootstrap/
│   ├── app.php                            ← Laravel 11 application bootstrap
│   └── providers.php
├── config/
│   ├── app.php
│   ├── auth.php
│   ├── cors.php
│   ├── database.php
│   └── sanctum.php
├── database/
│   ├── migrations/
│   └── seeders/
│       ├── DatabaseSeeder.php
│       ├── AdminUserSeeder.php
│       ├── CreatorLevelSeeder.php
│       ├── GiftSeeder.php
│       └── DemoDataSeeder.php             ← dev only
├── public/
│   ├── index.php
│   └── storage → ../storage/app/public   ← symlink
├── resources/
│   ├── css/app.css
│   ├── js/app.js
│   └── views/
│       ├── layouts/
│       ├── auth/
│       ├── website/
│       ├── dashboard/
│       │   ├── admin/
│       │   ├── creator/
│       │   └── user/
│       ├── components/
│       └── errors/
├── routes/
│   ├── web.php
│   ├── api.php
│   └── console.php
├── storage/
│   ├── app/
│   │   └── public/
│   │       ├── videos/
│   │       ├── thumbnails/
│   │       └── avatars/
│   ├── framework/
│   └── logs/
├── tailwind.config.js
├── vite.config.js
├── postcss.config.js
├── composer.json
├── package.json
└── .env.example
```

---

## Service Layer Pattern

Controllers stay thin. Business logic goes into **Service classes**:

```
Controller receives request
    │
    ▼
FormRequest validates input
    │
    ▼
Controller calls Service method
    │
    ▼
Service executes business logic
  - DB operations via Eloquent
  - Dispatches Jobs (async)
  - Fires Events
    │
    ▼
Controller returns JSON / Blade view
```

Example:
```php
// VideoController@store
public function store(StoreVideoRequest $request): JsonResponse
{
    $video = $this->videoService->upload($request->validated(), $request->file('video'));
    return response()->json(['success' => true, 'data' => $video], 201);
}
```

---

## Observer Pattern (Counter Denormalization)

Counters on `videos` and `profiles` are updated via Model Observers - no raw SQL `UPDATE` in controllers.

| Event | Observer | Action |
|-------|----------|--------|
| VideoLike created | VideoLikeObserver | `videos.likes_count++`, `profiles.total_likes++` |
| VideoLike deleted | VideoLikeObserver | `videos.likes_count--`, `profiles.total_likes--` |
| Follower created | FollowerObserver | `profiles.total_followers++` (followed), `profiles.total_following++` (follower) |
| Follower deleted | FollowerObserver | `profiles.total_followers--`, `profiles.total_following--` |
| Video created (published) | VideoObserver | `profiles.total_videos++` |
| Video deleted | VideoObserver | `profiles.total_videos--` |

Observers are registered in `AppServiceProvider::boot()`.

---

## Queue / Jobs Plan

| Job | Trigger | Purpose |
|-----|---------|---------|
| `ProcessVideoThumbnail` | Video uploaded | Extract first-frame thumbnail with FFmpeg |
| `SendPushNotification` | Like, comment, follow, gift | Send FCM push to user's devices |
| `AggregateCreatorAnalytics` | Daily scheduled (2AM) | Summarize views/followers/earnings into `creator_analytics` |
| `PurgeExpiredTokens` | Daily scheduled | Delete expired Sanctum tokens |

All jobs use the `database` queue driver at launch. Migrating to Redis in Phase 6 requires only a config change.

**Supervisor config** (2 workers):
```ini
[program:teezer-worker]
command=php /var/www/teezer/server/artisan queue:work database --sleep=3 --tries=3 --max-time=3600
numprocs=2
```

---

## File Storage Strategy

### Phase 1–5: Local VPS disk

```
storage/app/public/
├── videos/         {uuid}.mp4
├── thumbnails/     {uuid}.jpg
└── avatars/        {uuid}.jpg
```

Public URL: `https://teezer.live/storage/videos/{uuid}.mp4`

All uploaded filenames are UUID-replaced server-side. Original filenames are never stored.

### Phase 6+: Cloudflare R2

```dotenv
FILESYSTEM_DISK=s3
AWS_BUCKET=teezer-media
AWS_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_DEFAULT_REGION=auto
```

Cloudflare R2 has no egress fees, making it ideal for video delivery. Files remain served through Cloudflare CDN.

---

## Caching Strategy

### Phase 1–5: File cache (zero setup)

```dotenv
CACHE_DRIVER=file
```

Cached: user profiles, video metadata, trending hashtags, feed results.

### Phase 6+: Redis

```dotenv
CACHE_DRIVER=redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

Redis also handles: rate limiting, Sanctum token lookup caching, feed result caching.

---

## API Rate Limiting

Defined in `bootstrap/app.php` via `->withMiddleware()`:

| Group | Limit | Applied to |
|-------|-------|-----------|
| `auth` | 10/min per IP | `/api/v1/auth/register`, `/api/v1/auth/login` |
| `uploads` | 5/min per token | `POST /api/v1/videos` |
| `feed` | 60/min per token | `/api/v1/videos/feed`, `/api/v1/explore/*` |
| `api` (default) | 120/min per token | All other API routes |
| `web-login` | 10/min per IP | `POST /login` |

---

## Error Handling

All API errors return the standard envelope:
```json
{
  "success": false,
  "message": "Human readable message",
  "errors": { }
}
```

HTTP exceptions (401, 403, 404, 422, 429, 500) are intercepted in `bootstrap/app.php` `->withExceptions()` and formatted as JSON for API routes, Blade views for web routes.

---

## Development Phases

| Phase | Focus | Key Deliverables | Status |
|-------|-------|-----------------|--------|
| 1 | Foundation | Laravel project, auth, roles, migrations, admin Blade stubs | ✅ Done |
| 2 | Admin Panel UI | Full admin dashboard Blade views (Phase 2–4) | ✅ Done |
| 3 | Auth & Roles | Email verification, change-password, RoleMiddleware, permissions | ✅ Done |
| 4 | Admin Panel (remaining views) | Moderation, feed control, creators, audit, system settings | ✅ Done |
| 5 | Core Production APIs | Video CRUD, interactions, social, notifications, studio, admin API | ✅ Done |
| 6 | Infrastructure | Cloudflare R2, Redis cache/queue, Nginx tuning, VPS deploy | ⏳ Next |
| 7 | Creator Analytics | AggregateCreatorAnalytics job, FCM push, analytics backfill | ⏳ Planned |
| 8 | Monetisation | Wallet, gifts, subscriptions, payout flow | ⏳ Planned |
| 9 | Hardening | Rate limit tuning, SQL optimization, security audit, load testing | ⏳ Planned |

### Phase 5 - What was built

**New migrations:** `admin_action_logs` (#30), `app_settings` (#31)

**New models:** `Follower`, `BlockedUser`, `AdminActionLog`, `AppSetting`

**New API Resources:** `VideoResource`, `UserResource`, `CommentResource`, `NotificationResource`

**New Services (full implementations):**
- `StorageService` - local disk with `videos/YYYY/MM/uuid.ext` path structure, R2-ready
- `VideoService` - DB transaction: store files → create video → sync hashtags → dispatch thumbnail job
- `FeedService` - engagement score: `(likes×2 + comments×3 + saves×4 + min(shares×5,500) + recency×2)`
- `NotificationService` - in-app + FCM push, self-notification guard, deduplication

**New API controllers (all under `/api/v1`):**
- `VideoController` - feed, followingFeed, trending, show, store, update, destroy, recordView
- `VideoInteractionController` - like, unlike, save, unsave, share, report
- `CommentController` - index, store, destroy, like, unlike
- `FollowController` - follow (with block-check + counter txn), unfollow
- `BlockController` - index, block (cascade unfollows), unblock
- `NotificationController` - index, unreadCount, markRead, markAllRead, destroy
- `UserController` - show, videos, liked, followers, following, search, suggestions
- `ExploreController` - trending, hashtags, hashtagVideos, search
- `Studio/StudioDashboardController` - dashboard, creatorLevel, monetization
- `Studio/StudioAnalyticsController` - daily analytics with period filter
- `Studio/StudioContentController` - own video list with status filter + sort
- `Admin/AdminApiController` - dashboardStats, userStats, videoStats, reportStats, banUser, unbanUser, removeVideo, actionReport, actionLogs

---

## Environment Variables Reference

See `.env.example` in `server/` for the full list. Key groups:

| Group | Variables |
|-------|-----------|
| App | `APP_NAME`, `APP_ENV`, `APP_KEY`, `APP_DEBUG`, `APP_URL` |
| Database | `DB_CONNECTION`, `DB_HOST`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` |
| Session | `SESSION_DRIVER`, `SESSION_LIFETIME`, `SESSION_DOMAIN`, `SESSION_SECURE_COOKIE` |
| Sanctum | `SANCTUM_STATEFUL_DOMAINS` |
| Storage | `FILESYSTEM_DISK` |
| Mail | `MAIL_MAILER`, `MAIL_HOST`, `MAIL_FROM_ADDRESS` |
| Queue | `QUEUE_CONNECTION` |
| Admin | `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` |
| R2 (Phase 6) | `AWS_BUCKET`, `AWS_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |
| FCM (Phase 5) | `FIREBASE_PROJECT_ID`, `FIREBASE_CREDENTIALS` |
| Redis (Phase 6) | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` |
