# Teezer - Database Plan

> **Engine:** MySQL 8.0  
> **Charset:** `utf8mb4`  
> **Collation:** `utf8mb4_unicode_ci`  
> **ORM:** Laravel 11 Eloquent  

> **Key rule:** There is no separate `admin_users` table. All users (regular, creator, admin) share the `users` table. The `role` column controls access. The `reviewed_by` column on moderation tables references `users.id`.

---

## Tables Index

| # | Table | Description |
|---|---|---|
| 1 | `users` | All accounts - users, creators, and admins |
| 2 | `profiles` | Extended profile data (bio, location, category) |
| 3 | `social_links` | User's linked social media accounts |
| 4 | `videos` | All uploaded short videos |
| 5 | `video_likes` | Likes on videos |
| 6 | `video_comments` | Comments and replies on videos |
| 7 | `comment_likes` | Likes on individual comments |
| 8 | `video_saves` | Bookmarked / saved videos |
| 9 | `video_shares` | Share event tracking per platform |
| 10 | `video_views` | View tracking per video |
| 11 | `followers` | User follow relationships (self-join) |
| 12 | `blocked_users` | User block relationships (self-join) |
| 13 | `hashtags` | Unique hashtag registry |
| 14 | `video_hashtags` | Pivot: videos ↔ hashtags |
| 15 | `audio_tracks` | Music / audio tracks |
| 16 | `highlights` | Profile story highlights |
| 17 | `video_reports` | Reports filed against videos |
| 18 | `user_reports` | Reports filed against users |
| 19 | `notifications` | In-app notifications |
| 20 | `user_devices` | Push notification device tokens |
| 21 | `verification_requests` | Badge verification submissions |
| 22 | `creator_levels` | Level definitions with XP thresholds |
| 23 | `creator_progress` | Per-user XP and current level |
| 24 | `creator_analytics` | Daily aggregated creator metrics |
| 25 | `wallets` | User wallet balances |
| 26 | `wallet_transactions` | Credit / debit history |
| 27 | `gifts` | Gift type definitions |
| 28 | `gift_transactions` | Gifts sent between users |
| 29 | `subscriptions` | Premium subscription records |
| 30 | `admin_action_logs` | Audit trail of all admin actions - added Phase 5 |
| 31 | `app_settings` | Key-value platform configuration - added Phase 5 |
| 32 | `playlists` | Admin-managed curated/featured/trending playlist definitions - added Phase 6 |
| 33 | `playlist_videos` | Pivot: playlists ↔ videos with sort order - added Phase 6 |

---

## Detailed Schema

### 1. users
The single source of truth for all accounts. Role column determines access level.

```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
name              VARCHAR(100)      NOT NULL
username          VARCHAR(50)       UNIQUE NOT NULL
email             VARCHAR(191)      UNIQUE NOT NULL
phone             VARCHAR(20)       UNIQUE NULL
password          VARCHAR(255)      NOT NULL
avatar            VARCHAR(500)      NULL      -- R2 object key (e.g. images/2026/05/uuid.jpg)
date_of_birth     DATE              NULL
country           VARCHAR(100)      NULL
bio               TEXT              NULL
role              ENUM('user','creator','admin')  DEFAULT 'user'
is_verified       BOOLEAN           DEFAULT FALSE   -- blue tick badge
is_private        BOOLEAN           DEFAULT FALSE
is_active         BOOLEAN           DEFAULT TRUE
is_banned         BOOLEAN           DEFAULT FALSE
ban_reason        VARCHAR(500)      NULL
email_verified_at TIMESTAMP         NULL             -- added in migration 2025_05_24_000026 (Phase 3)
remember_token    VARCHAR(100)      NULL
created_at        TIMESTAMP
updated_at        TIMESTAMP
```

**Indexes:** `username` (unique), `email` (unique), `role` (regular), `is_banned` (regular)

---

### 2. profiles
Extended profile information separated from core auth data.

```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
user_id           BIGINT UNSIGNED   UNIQUE NOT NULL  FK → users.id (cascade delete)
location          VARCHAR(255)      NULL
website           VARCHAR(500)      NULL
joined_label      VARCHAR(50)       NULL             -- "Joined Jan 2022" (denormalized display)
category          VARCHAR(100)      NULL             -- "Dance", "Lifestyle", "Travel"
creator_badge     VARCHAR(50)       NULL             -- "Rising Star", "Trending Creator"
total_followers   INT UNSIGNED      DEFAULT 0
total_following   INT UNSIGNED      DEFAULT 0
total_likes       BIGINT UNSIGNED   DEFAULT 0
total_videos      INT UNSIGNED      DEFAULT 0
profile_views     BIGINT UNSIGNED   DEFAULT 0
created_at        TIMESTAMP
updated_at        TIMESTAMP
```

---

### 3. social_links
```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
user_id           BIGINT UNSIGNED   NOT NULL  FK → users.id (cascade delete)
platform          ENUM('instagram','youtube','tiktok','telegram','whatsapp','twitter','website')
url               VARCHAR(500)      NOT NULL
sort_order        TINYINT           DEFAULT 0
created_at        TIMESTAMP
updated_at        TIMESTAMP
UNIQUE(user_id, platform)
```

---

### 4. videos
```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
user_id           BIGINT UNSIGNED   NOT NULL  FK → users.id (cascade delete)
title             VARCHAR(255)      NULL
caption           TEXT              NULL
video_url         VARCHAR(500)      NOT NULL   -- R2 object key (e.g. videos/2026/05/uuid.mp4)
thumbnail_url     VARCHAR(500)      NULL       -- R2 object key
mime_type         VARCHAR(100)      NULL       -- e.g. video/mp4
duration          SMALLINT UNSIGNED NULL       -- seconds
file_size         BIGINT UNSIGNED   NULL       -- bytes
width             SMALLINT UNSIGNED NULL
height            SMALLINT UNSIGNED NULL
audio_track_id    BIGINT UNSIGNED   NULL       FK → audio_tracks.id (set null)
custom_audio_name VARCHAR(255)      NULL       -- when no audio_track_id
status            ENUM('draft','scheduled','published','private','removed')  DEFAULT 'published'
scheduled_at      TIMESTAMP         NULL
allow_comments    BOOLEAN           DEFAULT TRUE
allow_duet        BOOLEAN           DEFAULT TRUE
allow_stitch      BOOLEAN           DEFAULT TRUE
views_count       BIGINT UNSIGNED   DEFAULT 0
likes_count       BIGINT UNSIGNED   DEFAULT 0
comments_count    INT UNSIGNED      DEFAULT 0
saves_count       INT UNSIGNED      DEFAULT 0
shares_count      INT UNSIGNED      DEFAULT 0
is_flagged        BOOLEAN           DEFAULT FALSE
created_at        TIMESTAMP
updated_at        TIMESTAMP
deleted_at        TIMESTAMP         NULL       -- soft delete
```

**Indexes:** `user_id`, `status`, `created_at DESC`, `is_flagged`

---

### 5. video_likes
```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
video_id          BIGINT UNSIGNED   NOT NULL  FK → videos.id (cascade delete)
user_id           BIGINT UNSIGNED   NOT NULL  FK → users.id (cascade delete)
created_at        TIMESTAMP
UNIQUE(video_id, user_id)
```

---

### 6. video_comments
```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
video_id          BIGINT UNSIGNED   NOT NULL  FK → videos.id (cascade delete)
user_id           BIGINT UNSIGNED   NOT NULL  FK → users.id (cascade delete)
parent_id         BIGINT UNSIGNED   NULL      FK → video_comments.id (cascade delete)  -- reply
body              TEXT              NOT NULL
likes_count       INT UNSIGNED      DEFAULT 0
is_pinned         BOOLEAN           DEFAULT FALSE
is_hidden         BOOLEAN           DEFAULT FALSE
created_at        TIMESTAMP
updated_at        TIMESTAMP
deleted_at        TIMESTAMP         NULL
```

**Indexes:** `video_id`, `parent_id`, `user_id`

---

### 7. comment_likes
```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
comment_id        BIGINT UNSIGNED   NOT NULL  FK → video_comments.id (cascade delete)
user_id           BIGINT UNSIGNED   NOT NULL  FK → users.id (cascade delete)
created_at        TIMESTAMP
UNIQUE(comment_id, user_id)
```

---

### 8. video_saves
```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
video_id          BIGINT UNSIGNED   NOT NULL  FK → videos.id (cascade delete)
user_id           BIGINT UNSIGNED   NOT NULL  FK → users.id (cascade delete)
created_at        TIMESTAMP
UNIQUE(video_id, user_id)
```

---

### 9. video_shares
```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
video_id          BIGINT UNSIGNED   NOT NULL  FK → videos.id (cascade delete)
user_id           BIGINT UNSIGNED   NULL      FK → users.id (set null)  -- nullable for anonymous
platform          VARCHAR(50)       NULL      -- 'whatsapp', 'instagram', 'copy_link', 'other'
created_at        TIMESTAMP
```

---

### 10. video_views
```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
video_id          BIGINT UNSIGNED   NOT NULL  FK → videos.id (cascade delete)
user_id           BIGINT UNSIGNED   NULL      FK → users.id (set null)
ip_address        VARCHAR(45)       NULL
watch_duration    SMALLINT UNSIGNED NULL      -- seconds watched
created_at        TIMESTAMP
```

**Index:** `video_id`, `(video_id, user_id)`, `created_at`

---

### 11. followers
Self-join. `follower_id` is following `following_id`.

```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
follower_id       BIGINT UNSIGNED   NOT NULL  FK → users.id (cascade delete)
following_id      BIGINT UNSIGNED   NOT NULL  FK → users.id (cascade delete)
created_at        TIMESTAMP
UNIQUE(follower_id, following_id)
CHECK (follower_id != following_id)
```

---

### 12. blocked_users
```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
blocker_id        BIGINT UNSIGNED   NOT NULL  FK → users.id (cascade delete)
blocked_id        BIGINT UNSIGNED   NOT NULL  FK → users.id (cascade delete)
created_at        TIMESTAMP
UNIQUE(blocker_id, blocked_id)
CHECK (blocker_id != blocked_id)
```

---

### 13. hashtags
```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
name              VARCHAR(100)      UNIQUE NOT NULL   -- stored without #
videos_count      INT UNSIGNED      DEFAULT 0
created_at        TIMESTAMP
updated_at        TIMESTAMP
```

---

### 14. video_hashtags
```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
video_id          BIGINT UNSIGNED   NOT NULL  FK → videos.id (cascade delete)
hashtag_id        BIGINT UNSIGNED   NOT NULL  FK → hashtags.id (cascade delete)
UNIQUE(video_id, hashtag_id)
```

---

### 15. audio_tracks
```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
title             VARCHAR(255)      NOT NULL
artist            VARCHAR(255)      NULL
cover_url         VARCHAR(500)      NULL
audio_url         VARCHAR(500)      NOT NULL
duration          SMALLINT UNSIGNED NULL      -- seconds
usage_count       INT UNSIGNED      DEFAULT 0
is_original       BOOLEAN           DEFAULT FALSE
user_id           BIGINT UNSIGNED   NULL      FK → users.id (set null)  -- uploader (original sounds)
created_at        TIMESTAMP
updated_at        TIMESTAMP
```

---

### 16. highlights
```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
user_id           BIGINT UNSIGNED   NOT NULL  FK → users.id (cascade delete)
title             VARCHAR(100)      NOT NULL
cover_url         VARCHAR(500)      NULL
sort_order        TINYINT           DEFAULT 0
created_at        TIMESTAMP
updated_at        TIMESTAMP
```

---

### 17. video_reports
`reviewed_by` references `users.id` (admin user), not a separate admin table.

```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
video_id          BIGINT UNSIGNED   NOT NULL  FK → videos.id (cascade delete)
reporter_id       BIGINT UNSIGNED   NOT NULL  FK → users.id (cascade delete)
reason            ENUM('spam','nudity','hate','misinformation','violence','copyright','other')
description       TEXT              NULL
status            ENUM('pending','reviewed','dismissed','actioned')  DEFAULT 'pending'
reviewed_by       BIGINT UNSIGNED   NULL      FK → users.id (set null)  -- admin who reviewed
reviewed_at       TIMESTAMP         NULL
created_at        TIMESTAMP
```

**Index:** `status`, `video_id`

---

### 18. user_reports
```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
reported_user_id  BIGINT UNSIGNED   NOT NULL  FK → users.id (cascade delete)
reporter_id       BIGINT UNSIGNED   NOT NULL  FK → users.id (cascade delete)
reason            ENUM('spam','harassment','fake','hate','other')
description       TEXT              NULL
status            ENUM('pending','reviewed','dismissed','actioned')  DEFAULT 'pending'
reviewed_by       BIGINT UNSIGNED   NULL      FK → users.id (set null)
reviewed_at       TIMESTAMP         NULL
created_at        TIMESTAMP
```

---

### 19. notifications
```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
user_id           BIGINT UNSIGNED   NOT NULL  FK → users.id (cascade delete)   -- recipient
actor_id          BIGINT UNSIGNED   NULL      FK → users.id (set null)         -- who triggered it
type              ENUM('like','comment','follow','mention','system','gift','verification','report_actioned')
entity_type       VARCHAR(50)       NULL      -- 'video', 'comment', 'verification_request'
entity_id         BIGINT UNSIGNED   NULL
message           VARCHAR(500)      NULL
is_read           BOOLEAN           DEFAULT FALSE
created_at        TIMESTAMP
```

**Index:** `user_id`, `is_read`, `created_at DESC`

---

### 20. user_devices
```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
user_id           BIGINT UNSIGNED   NOT NULL  FK → users.id (cascade delete)
device_token      VARCHAR(500)      NOT NULL
platform          ENUM('android','ios')
created_at        TIMESTAMP
updated_at        TIMESTAMP
UNIQUE(user_id, device_token)
```

---

### 21. verification_requests
```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
user_id           BIGINT UNSIGNED   NOT NULL  FK → users.id (cascade delete)
category          VARCHAR(100)      NULL      -- 'creator', 'public_figure', 'business', 'organization'
document_url      VARCHAR(500)      NULL      -- full CDN URL (https://media.teezer.live/...)
document_key      VARCHAR(500)      NULL      -- R2 object key for deletion / presigned access
reason            TEXT              NULL
status            ENUM('pending','approved','rejected')  DEFAULT 'pending'
rejection_reason  TEXT              NULL
reviewed_by       BIGINT UNSIGNED   NULL      FK → users.id (set null)  -- admin
reviewed_at       TIMESTAMP         NULL
created_at        TIMESTAMP
updated_at        TIMESTAMP
```

---

### 22. creator_levels
Seeded at deployment. Not created by users.

```sql
id                TINYINT UNSIGNED  PK
level_name        VARCHAR(100)      NOT NULL    -- 'Newcomer', 'Rising Star', etc.
min_xp            INT UNSIGNED      NOT NULL
max_xp            INT UNSIGNED      NOT NULL
badge_color       VARCHAR(7)        NULL        -- hex, e.g. '#fe2c55'
icon_url          VARCHAR(500)      NULL
perks             JSON              NULL        -- list of perk descriptions
```

**Seed data:**
| id | level_name | min_xp | max_xp |
|---|---|---|---|
| 1 | Newcomer | 0 | 499 |
| 2 | Rising Star | 500 | 2,999 |
| 3 | Creator | 3,000 | 9,999 |
| 4 | Verified Creator | 10,000 | 49,999 |
| 5 | Star | 50,000 | 999,999 |

---

### 23. creator_progress
```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
user_id           BIGINT UNSIGNED   UNIQUE NOT NULL  FK → users.id (cascade delete)
current_level_id  TINYINT UNSIGNED  NOT NULL  FK → creator_levels.id
current_xp        INT UNSIGNED      DEFAULT 0
total_xp_earned   INT UNSIGNED      DEFAULT 0
updated_at        TIMESTAMP
```

---

### 24. creator_analytics
One row per user per calendar day. Aggregated by a scheduled job.

```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
user_id           BIGINT UNSIGNED   NOT NULL  FK → users.id (cascade delete)
date              DATE              NOT NULL
views             BIGINT UNSIGNED   DEFAULT 0
watch_time_mins   INT UNSIGNED      DEFAULT 0
new_followers     INT UNSIGNED      DEFAULT 0
lost_followers    INT UNSIGNED      DEFAULT 0
likes             BIGINT UNSIGNED   DEFAULT 0
comments          INT UNSIGNED      DEFAULT 0
shares            INT UNSIGNED      DEFAULT 0
saves             INT UNSIGNED      DEFAULT 0
earnings          DECIMAL(10,2)     DEFAULT 0.00
UNIQUE(user_id, date)
```

---

### 25. wallets
```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
user_id           BIGINT UNSIGNED   UNIQUE NOT NULL  FK → users.id (cascade delete)
balance           DECIMAL(12,2)     DEFAULT 0.00
coins_balance     BIGINT UNSIGNED   DEFAULT 0
gift_earnings     DECIMAL(12,2)     DEFAULT 0.00
subscription_earnings DECIMAL(12,2) DEFAULT 0.00
ad_earnings       DECIMAL(12,2)     DEFAULT 0.00
total_withdrawn   DECIMAL(12,2)     DEFAULT 0.00
created_at        TIMESTAMP
updated_at        TIMESTAMP
```

---

### 26. wallet_transactions
```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
wallet_id         BIGINT UNSIGNED   NOT NULL  FK → wallets.id (cascade delete)
type              ENUM('credit','debit','withdrawal','gift_received','subscription_income','ad_income')
amount            DECIMAL(10,2)     NOT NULL
description       VARCHAR(255)      NULL
reference_id      VARCHAR(100)      NULL      -- external payment ref
created_at        TIMESTAMP
```

---

### 27. gifts
```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
name              VARCHAR(100)      NOT NULL    -- 'Rose', 'Crown', 'Star'
icon_url          VARCHAR(500)      NULL
coin_value        INT UNSIGNED      NOT NULL    -- cost in coins
cash_value        DECIMAL(8,4)      NOT NULL    -- value in USD/currency
created_at        TIMESTAMP
```

---

### 28. gift_transactions
```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
gift_id           BIGINT UNSIGNED   NOT NULL  FK → gifts.id
sender_id         BIGINT UNSIGNED   NOT NULL  FK → users.id
receiver_id       BIGINT UNSIGNED   NOT NULL  FK → users.id
video_id          BIGINT UNSIGNED   NULL      FK → videos.id (set null)
quantity          INT UNSIGNED      DEFAULT 1
total_coins       INT UNSIGNED      NOT NULL
created_at        TIMESTAMP
```

---

### 29. subscriptions
```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
user_id           BIGINT UNSIGNED   NOT NULL  FK → users.id (cascade delete)
plan              ENUM('monthly','yearly')
status            ENUM('active','cancelled','expired')
price             DECIMAL(8,2)      NOT NULL
currency          VARCHAR(3)        DEFAULT 'USD'
started_at        TIMESTAMP
expires_at        TIMESTAMP
cancelled_at      TIMESTAMP         NULL
created_at        TIMESTAMP
updated_at        TIMESTAMP
```

---

### 30. admin_action_logs *(added Phase 5)*
Immutable audit trail. One row per admin action. No `updated_at`.

```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
admin_id          BIGINT UNSIGNED   NOT NULL  FK → users.id (cascade delete)
action            VARCHAR(100)      NOT NULL  -- 'ban_user', 'remove_video', 'action_report', ...
category          VARCHAR(50)       NOT NULL  -- 'user_management', 'content_actions', 'system', ...
target_type       VARCHAR(50)       NULL      -- 'user', 'video', 'report', ...
target_id         BIGINT UNSIGNED   NULL
description       TEXT              NULL
metadata          JSON              NULL      -- additional context (reason, action type, etc.)
ip_address        VARCHAR(45)       NULL
severity          VARCHAR(20)       DEFAULT 'info'  -- 'critical', 'high', 'medium', 'info'
created_at        TIMESTAMP         DEFAULT CURRENT_TIMESTAMP
```

**Indexes:** `admin_id`, `action`, `category`, `(target_type, target_id)`, `created_at DESC`

---

### 31. app_settings *(added Phase 5)*
Key-value store for platform configuration. Cached in Laravel cache (1-hour TTL).

```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
key               VARCHAR(100)      UNIQUE NOT NULL
value             TEXT              NULL
type              VARCHAR(20)       DEFAULT 'string'  -- 'string', 'boolean', 'integer', 'json'
group             VARCHAR(50)       DEFAULT 'general'
description       VARCHAR(255)      NULL
is_public         BOOLEAN           DEFAULT FALSE      -- if true, exposed via public settings API
created_at        TIMESTAMP
updated_at        TIMESTAMP
```

**Accessed via:** `AppSetting::get('key', $default)` / `AppSetting::set('key', $value)`

---

### 32. playlists *(added Phase 6)*
Admin-created curated, featured, or trending playlists shown in the app.

```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
user_id           BIGINT UNSIGNED   NOT NULL  FK → users.id (cascade delete)  -- admin creator
title             VARCHAR(255)      NOT NULL
description       TEXT              NULL
cover_url         VARCHAR(500)      NULL
type              VARCHAR(50)       DEFAULT 'curated'  -- 'featured', 'curated', 'trending'
is_active         BOOLEAN           DEFAULT TRUE
sort_order        INT UNSIGNED      DEFAULT 0
videos_count      INT UNSIGNED      DEFAULT 0          -- denormalized
created_at        TIMESTAMP
updated_at        TIMESTAMP
deleted_at        TIMESTAMP         NULL               -- soft delete
```

---

### 33. playlist_videos *(added Phase 6)*
Pivot table linking playlists to videos with custom ordering.

```sql
id                BIGINT UNSIGNED   PK AUTO_INCREMENT
playlist_id       BIGINT UNSIGNED   NOT NULL  FK → playlists.id (cascade delete)
video_id          BIGINT UNSIGNED   NOT NULL  FK → videos.id (cascade delete)
sort_order        INT UNSIGNED      DEFAULT 0
created_at        TIMESTAMP
updated_at        TIMESTAMP
UNIQUE(playlist_id, video_id)
```

---

## Eloquent Relationships Map

```
User
  hasOne     → Profile
  hasOne     → CreatorProgress
  hasOne     → Wallet
  hasMany    → Video
  hasMany    → VideoLike
  hasMany    → VideoSave
  hasMany    → VideoComment
  hasMany    → Notification (as recipient)
  hasMany    → Notification (as actor)
  hasMany    → VerificationRequest
  hasMany    → CreatorAnalytic
  hasMany    → SocialLink
  hasMany    → Highlight
  hasMany    → UserDevice
  hasMany    → Subscription
  belongsToMany → User (followers, via followers table)
  belongsToMany → User (following, via followers table)
  belongsToMany → User (blocked, via blocked_users table)

Video
  belongsTo  → User
  belongsTo  → AudioTrack
  hasMany    → VideoLike
  hasMany    → VideoComment
  hasMany    → VideoSave
  hasMany    → VideoShare
  hasMany    → VideoView
  hasMany    → VideoReport
  belongsToMany → Hashtag (via video_hashtags)
```

---

## Laravel Migration Order

Run in this order to satisfy foreign key constraints:

1. `users`
2. `creator_levels`
3. `profiles`
4. `social_links`
5. `audio_tracks`
6. `videos`
7. `video_likes`
8. `video_comments`
9. `comment_likes`
10. `video_saves`
11. `video_shares`
12. `video_views`
13. `followers`
14. `blocked_users`
15. `hashtags`
16. `video_hashtags`
17. `highlights`
18. `video_reports`
19. `user_reports`
20. `notifications`
21. `user_devices`
22. `verification_requests`
23. `creator_progress`
24. `creator_analytics`
25. `wallets`
26. `wallet_transactions`
27. `gifts`
28. `gift_transactions`
29. `subscriptions`
30. `admin_action_logs`
31. `app_settings`
32. `playlists`
33. `playlist_videos`

---

## Seeders Plan

| Seeder | What it creates |
|---|---|
| `CreatorLevelSeeder` | 5 levels with XP ranges and badge colors |
| `GiftSeeder` | 5 gift types (Rose, Heart, Crown, Star, Diamond) |
| `AdminUserSeeder` | 1 superadmin account (role='admin'), seeded from `.env` |
| `DemoDataSeeder` | 5 users (1 admin, 1 creator, 3 users), demo videos, follows, likes - **dev only** |

---

## Counter Denormalization Strategy

Rather than `COUNT(*)` on every request, counter columns on `videos` and `profiles` are updated:
- **On like:** `videos.likes_count++` and `profiles.total_likes++`
- **On follow:** `profiles.total_followers++` (for followed user), `profiles.total_following++` (for follower)
- **On video publish:** `profiles.total_videos++`
- **On view:** `videos.views_count++`

These are updated via Laravel Observers or within service classes, not in raw controllers.
