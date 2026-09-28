# Reelsoo - API Plan

> **Scope:** This document covers only the REST API consumed by the Flutter mobile app.  
> The web dashboard uses standard Laravel web routes with session auth - those are documented in `role-based-login-plan.md`.

---

## API Base URL

| Environment | Base URL |
|---|---|
| Local development | `http://192.168.x.x:8000/api/v1` |
| Production (VPS) | `https://api.reelsoo.com/api/v1` |

---

## Authentication

The API uses **Laravel Sanctum token-based authentication**.

### Request Headers (authenticated endpoints)
```
Authorization: Bearer {sanctum_token}
Accept: application/json
Content-Type: application/json
X-App-Version: 1.0.0
```

### Login returns
```json
{
  "success": true,
  "data": {
    "token": "1|aBcDeFgHiJkL...",
    "token_type": "Bearer",
    "user": {
      "id": 42,
      "name": "Ananya Rai",
      "username": "ananya_rai",
      "email": "ananya@example.com",
      "role": "creator",
      "permissions": [
        "access_creator_studio",
        "access_feed",
        "manage_own_content",
        "view_own_analytics",
        "request_verification",
        "view_monetization"
      ],
      "avatar": "https://media.reelsoo.com/images/2026/05/uuid.jpg",
      "is_verified": true,
      "email_verified_at": "2025-05-24T10:30:00+00:00",
      "profile": {
        "total_followers": 1200,
        "total_following": 45,
        "total_likes": 48000,
        "total_videos": 32
      },
      "created_at": "2025-01-15T08:00:00+00:00"
    }
  }
}
```

> **Note:** `register` returns the same `user` shape as `login`, including `permissions`.  
> The Flutter app should read `role` and `permissions` to determine which UI surfaces to show.

The Flutter app stores this token in `SharedPreferences` and sends it with every authenticated request.

---

## Standard Response Envelopes

### Success
```json
{
  "success": true,
  "message": "Done",
  "data": { }
}
```

### Paginated list
```json
{
  "success": true,
  "data": [ ],
  "meta": {
    "current_page": 1,
    "per_page": 15,
    "total": 128,
    "last_page": 9,
    "next_page_url": "https://api.reelsoo.com/api/v1/videos/feed?page=2"
  }
}
```

### Validation error
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": {
    "email": ["The email has already been taken."],
    "password": ["The password must be at least 8 characters."]
  }
}
```

### Generic error
```json
{
  "success": false,
  "message": "Unauthenticated."
}
```

---

## HTTP Status Codes

| Code | Meaning |
|---|---|
| 200 | Success |
| 201 | Resource created |
| 204 | Success, no body (delete) |
| 400 | Bad request |
| 401 | Unauthenticated (missing or invalid token) |
| 403 | Forbidden (authenticated but not allowed) |
| 404 | Not found |
| 422 | Validation failed |
| 429 | Too many requests (rate limited) |
| 500 | Server error |

---

## Rate Limiting

| Group | Limit |
|---|---|
| Auth routes (login, register) | 10 requests / minute per IP |
| Feed & explore | 60 requests / minute per token |
| Uploads | 5 requests / minute per token |
| All other authenticated routes | 120 requests / minute per token |

---

## Endpoint Reference

---

### AUTH - `/api/v1/auth`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | No | Register new user account |
| POST | `/auth/login` | No | Login, returns Sanctum token |
| POST | `/auth/logout` | Yes | Revoke current token |
| POST | `/auth/logout-all` | Yes | Revoke all tokens (all devices) |
| GET | `/auth/me` | Yes | Get current authenticated user |
| POST | `/auth/forgot-password` | No | Send password reset link |
| POST | `/auth/reset-password` | No | Reset password with token |
| POST | `/auth/verify-email` | No | Verify email with OTP code |
| POST | `/auth/resend-verification` | Yes | Resend email verification |
| POST | `/auth/change-password` | Yes | Change password (requires current password) |

**POST `/auth/register` body:**
```json
{
  "name": "Ananya Rai",
  "username": "ananya_rai",
  "email": "ananya@example.com",
  "password": "SecurePass123!",
  "password_confirmation": "SecurePass123!",
  "date_of_birth": "2000-05-12",
  "country": "IN"
}
```

**POST `/auth/login` body:**
```json
{
  "login": "ananya_rai",
  "password": "SecurePass123!"
}
```
`login` accepts either email or username.

**POST `/auth/change-password` body:**
```json
{
  "current_password": "OldPass123!",
  "password": "NewSecurePass456!",
  "password_confirmation": "NewSecurePass456!"
}
```
On success: revokes all existing tokens and returns a new token. Requires `current_password` to be correct - returns `422` with `WRONG_PASSWORD` code otherwise.

---

### PROFILE - `/api/v1/profile`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/profile` | Yes | Get own full profile |
| PUT | `/profile` | Yes | Update own profile fields |
| POST | `/profile/avatar` | Yes | Upload/replace avatar image |
| DELETE | `/profile/avatar` | Yes | Remove avatar |
| GET | `/profile/social-links` | Yes | Get own social links |
| PUT | `/profile/social-links` | Yes | Replace all social links |
| GET | `/profile/highlights` | Yes | Get own highlights |
| POST | `/profile/highlights` | Yes | Create a highlight |
| PUT | `/profile/highlights/{id}` | Yes | Update a highlight |
| DELETE | `/profile/highlights/{id}` | Yes | Delete a highlight |

**PUT `/profile` body:**
```json
{
  "name": "Ananya Rai",
  "username": "ananya_rai",
  "bio": "Making little moments magical ✨",
  "location": "Mumbai, India",
  "website": "https://ananyarai.com",
  "category": "Dance",
  "date_of_birth": "2000-05-12",
  "country": "IN",
  "is_private": false
}
```

**POST `/profile/avatar`** - `multipart/form-data`, field: `avatar` (image file, max 5MB). Stored in R2 under `images/YYYY/MM/uuid.ext`. Response includes the full CDN URL (`https://media.reelsoo.com/...`).

---

### USERS - `/api/v1/users`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/users/{username}` | Optional | Get public profile of a user |
| GET | `/users/{username}/videos` | Optional | Get user's published videos |
| GET | `/users/{username}/liked` | Optional | Get liked videos (if public account) |
| GET | `/users/{username}/followers` | Optional | Get followers list |
| GET | `/users/{username}/following` | Optional | Get following list |
| GET | `/users/search` | Optional | Search users by name or username |
| GET | `/users/suggestions` | Yes | Get suggested users to follow |
| POST | `/users/{username}/follow` | Yes | Follow a user |
| DELETE | `/users/{username}/follow` | Yes | Unfollow a user |
| POST | `/users/{username}/block` | Yes | Block a user |
| DELETE | `/users/{username}/block` | Yes | Unblock a user |
| GET | `/users/blocked` | Yes | Get own block list |

**GET `/users/search`** - query params: `?q=ananya&page=1`

---

### VIDEOS - `/api/v1/videos`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/videos/feed` | Yes | Personalized home feed (For You) |
| GET | `/videos/following` | Yes | Feed from followed users |
| GET | `/videos/trending` | Optional | Trending videos |
| GET | `/videos/{id}` | Optional | Get single video detail |
| POST | `/videos` | Yes | Upload a new video |
| PUT | `/videos/{id}` | Yes | Update video metadata |
| DELETE | `/videos/{id}` | Yes | Delete own video (soft delete) |
| POST | `/videos/{id}/view` | Optional | Record a video view event |

**GET `/videos/feed`** - query params: `?page=1&per_page=10`

**POST `/videos`** - `multipart/form-data`:
```
video             [file]         Required. mp4/mov/webm, max 500MB. Uploaded to Cloudflare R2.
thumbnail         [file]         Optional. jpg/png, max 5MB. Uploaded to Cloudflare R2.
caption           string         Max 2200 chars
hashtags[]        string array   e.g. ["goodvibes","reelsoo"]
audio_track_id    integer        Optional
custom_audio_name string         Optional (if no audio_track_id)
status            string         'published'|'draft'|'private'
allow_comments    boolean        Default true
allow_duet        boolean        Default true
allow_stitch      boolean        Default true
scheduled_at      datetime       Optional ISO 8601, for scheduled posts
```

> MySQL stores the R2 object key (e.g. `videos/2026/05/uuid.mp4`). The API response expands keys to full CDN URLs (`https://media.reelsoo.com/...`). Response also includes `mime_type` and `file_size`.

**PUT `/videos/{id}` body:**
```json
{
  "caption": "Updated caption ✨",
  "hashtags": ["updated","reelsoo"],
  "status": "published",
  "allow_comments": true
}
```

---

### VIDEO INTERACTIONS - `/api/v1/videos/{id}`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/videos/{id}/like` | Yes | Like a video |
| DELETE | `/videos/{id}/like` | Yes | Unlike a video |
| POST | `/videos/{id}/save` | Yes | Save / bookmark a video |
| DELETE | `/videos/{id}/save` | Yes | Remove saved video |
| POST | `/videos/{id}/share` | Yes | Record a share event |
| POST | `/videos/{id}/report` | Yes | Report a video |
| GET | `/videos/{id}/comments` | Optional | Get comments (paginated) |
| POST | `/videos/{id}/comments` | Yes | Post a comment |
| DELETE | `/videos/{id}/comments/{commentId}` | Yes | Delete own comment |
| POST | `/videos/{id}/comments/{commentId}/like` | Yes | Like a comment |
| DELETE | `/videos/{id}/comments/{commentId}/like` | Yes | Unlike a comment |

**POST `/videos/{id}/share` body:**
```json
{
  "platform": "whatsapp"
}
```
`platform` options: `whatsapp`, `instagram`, `telegram`, `copy_link`, `other`

**POST `/videos/{id}/report` body:**
```json
{
  "reason": "spam",
  "description": "Repeated spam posting."
}
```
`reason` options: `spam`, `nudity`, `hate`, `misinformation`, `violence`, `copyright`, `other`

**POST `/videos/{id}/comments` body:**
```json
{
  "body": "This is so beautiful! 😍",
  "parent_id": null
}
```
`parent_id` - pass a comment ID to post a reply, or `null` for a top-level comment.

---

### EXPLORE - `/api/v1/explore`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/explore/trending` | Optional | Trending videos |
| GET | `/explore/hashtags` | Optional | Trending hashtags |
| GET | `/explore/hashtags/{name}` | Optional | Videos tagged with a hashtag |
| GET | `/explore/search` | Optional | Search videos, users, audio |

**GET `/explore/search`** - query params: `?q=goodvibes&type=all` (`type`: `all`, `videos`, `users`, `audio`)

---

### AUDIO - `/api/v1/audio`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/audio/trending` | Optional | Trending audio tracks |
| GET | `/audio/search` | Optional | Search audio by title or artist |
| GET | `/audio/{id}` | Optional | Get audio track details |
| GET | `/audio/{id}/videos` | Optional | Videos using this audio track |

**GET `/audio/search`** - query params: `?q=golden+hour`

---

### NOTIFICATIONS - `/api/v1/notifications`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/notifications` | Yes | Get all notifications (paginated) |
| GET | `/notifications/unread-count` | Yes | Get count of unread notifications |
| POST | `/notifications/{id}/read` | Yes | Mark single notification as read |
| POST | `/notifications/read-all` | Yes | Mark all as read |
| DELETE | `/notifications/{id}` | Yes | Delete a notification |

---

### CREATOR STUDIO - `/api/v1/studio`

Used by the Flutter app's in-app Studio section. The full dashboard is also available on the web.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/studio/dashboard` | Yes | Studio overview data |
| GET | `/studio/analytics` | Yes | Analytics data for a period |
| GET | `/studio/content` | Yes | Own video list (with filters) |
| GET | `/studio/creator-level` | Yes | Current level, XP, progress |
| GET | `/studio/monetization` | Yes | Wallet + earnings breakdown |

**GET `/studio/analytics`** - query params: `?period=7d` (`7d`, `30d`, `90d`, `1y`)

**GET `/studio/content`** - query params: `?status=published&page=1&sort=newest`
`status` options: `all`, `published`, `draft`, `scheduled`, `private`

**GET `/studio/dashboard` response:**
```json
{
  "success": true,
  "data": {
    "profile": { "name": "...", "username": "...", "avatar": "..." },
    "creator_level": { "level": 6, "name": "Rising Star", "current_xp": 7260, "next_level_xp": 10000 },
    "summary": {
      "views": 1240000, "views_change": 18.6,
      "watch_time_hours": 24700, "watch_time_change": 20.4,
      "new_followers": 18700, "followers_change": 12.8,
      "engagement_rate": 8.7, "engagement_change": 15.2
    },
    "quick_stats": {
      "total_views": 1240000,
      "watch_time_hours": 24700,
      "new_followers": 18700,
      "earnings": 3245.60
    },
    "recent_content": [ ],
    "unread_comments": 24
  }
}
```

---

### VERIFICATION - `/api/v1/verification`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/verification/status` | Yes | Get own verification request status |
| POST | `/verification/apply` | Yes | Submit verification request |

**POST `/verification/apply`** - `multipart/form-data`:
```
category     string   'creator' | 'public_figure' | 'business' | 'organization'
reason       string   Explanation text (max 1000 chars)
document     [file]   PDF, JPEG, PNG, or WebP. Max 10MB. Uploaded to Cloudflare R2.
```

Response `201`:
```json
{
  "success": true,
  "message": "Verification application submitted. Our team will review within 3–5 business days."
}
```

> The document file is stored in R2 under `documents/YYYY/MM/uuid.ext`. MySQL stores `document_url` (CDN URL) and `document_key` (R2 object key for deletion/presigned access). The document is never accessible via a public directory listing.

---

### WALLET - `/api/v1/wallet`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/wallet` | Yes | Get wallet balance and breakdown |
| GET | `/wallet/transactions` | Yes | Transaction history (paginated) |

---

### DEVICES - `/api/v1/devices`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/devices/register` | Yes | Register push notification token |
| DELETE | `/devices/{id}` | Yes | Remove device token on logout |

**POST `/devices/register` body:**
```json
{
  "device_token": "fcm_token_string_here",
  "platform": "android"
}
```

---

### ADMIN API - `/api/v1/admin` *(role: admin)*

All admin endpoints require `Authorization: Bearer {token}` and the authenticated user must have `role = admin`.

#### Stats & Reporting

| Method | Endpoint | Description |
|---|---|---|
| GET | `/admin/stats` | Dashboard overview (users, videos, reports, views) |
| GET | `/admin/stats/users` | User growth over 30 days, by-role breakdown |
| GET | `/admin/stats/videos` | Upload and view trends over 30 days |
| GET | `/admin/stats/reports` | Reports by status and reason, recent 10 |
| GET | `/admin/action-logs` | Paginated admin audit log |

**GET `/admin/action-logs`** - query params:
```
?category=content_actions&severity=high&admin_id=1&per_page=20&page=1
```
`severity` options: `critical`, `high`, `medium`, `info`

**GET `/admin/stats` response:**
```json
{
  "success": true,
  "data": {
    "users": {
      "total": 12400, "new_today": 43, "new_7d": 310,
      "banned": 12, "creators": 820, "admins": 2
    },
    "videos": {
      "total": 38200, "published": 35600, "draft": 1200,
      "private": 900, "removed": 500, "flagged": 34, "uploaded_today": 120
    },
    "reports": { "pending": 18, "reviewed": 440, "actioned": 210 },
    "views": { "today": 92000, "7d": 640000 }
  }
}
```

#### Moderation Actions

| Method | Endpoint | Description |
|---|---|---|
| POST | `/admin/users/{id}/ban` | Ban a user account |
| POST | `/admin/users/{id}/unban` | Unban a user account |
| DELETE | `/admin/videos/{id}` | Soft-delete and flag a video |
| POST | `/admin/reports/{id}/action` | Act on a video report |

**POST `/admin/users/{id}/ban` body:**
```json
{ "reason": "Repeated spam and hate speech violations." }
```

**POST `/admin/reports/{id}/action` body:**
```json
{ "action": "remove" }
```
`action` options: `warn`, `remove`, `ban`, `dismiss`

---

### HEALTH - `/api/v1/health`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/health` | No | Server health check (always returns 200 if online) |

**Response:**
```json
{
  "success": true,
  "message": "OK",
  "data": { "timestamp": "2025-05-24T10:30:00Z" }
}
```

---

## Pagination

All list endpoints accept:
```
?page=1&per_page=15
```
Default `per_page` is 15. Maximum is 50.

---

## API Versioning

- Current version: `v1`
- Breaking changes will bump to `v2` (old version kept alive for a migration period)
- Flutter app sends `X-App-Version` header; API can use this to gate features or send deprecation warnings

---

## File Upload Limits

| Type | Max Size | Accepted MIME types |
|---|---|---|
| Video | 500 MB | `video/mp4`, `video/quicktime`, `video/webm` |
| Thumbnail | 5 MB | `image/jpeg`, `image/png`, `image/webp` |
| Avatar | 5 MB | `image/jpeg`, `image/png`, `image/webp` |
| Verification doc | 10 MB | `image/jpeg`, `image/png`, `application/pdf` |

All uploaded filenames are replaced with a UUID (`uuid4().ext`) server-side to prevent path traversal.

---

## Laravel Route File Structure

```
server/routes/
├── api.php        ← All /api/v1/* routes (Sanctum token auth)
└── web.php        ← Website + login + dashboard routes (session auth)
```

`api.php` is prefixed with `/api/v1` via `bootstrap/app.php` (Laravel 11).

**api.php structure:**
```php
Route::prefix('auth')->group(function () { /* ... */ });
Route::middleware('auth:sanctum')->group(function () {
    Route::prefix('profile')->group(function () { /* ... */ });
    Route::prefix('videos')->group(function () { /* ... */ });
    Route::prefix('studio')->group(function () { /* ... */ });
    // etc.
});
// Public (no auth required)
Route::prefix('explore')->group(function () { /* ... */ });
Route::prefix('audio')->group(function () { /* ... */ });
```

---

## Controller Directory Structure

```
server/app/Http/Controllers/Api/
├── Auth/
│   ├── ApiAuthController.php
│   └── PasswordResetController.php
├── Admin/
│   └── AdminApiController.php
├── Studio/
│   ├── StudioDashboardController.php
│   ├── StudioAnalyticsController.php
│   └── StudioContentController.php
├── ProfileController.php
├── UserController.php
├── VideoController.php
├── VideoInteractionController.php
├── CommentController.php
├── FollowController.php
├── BlockController.php
├── ExploreController.php
├── AudioController.php
├── NotificationController.php
├── VerificationController.php
├── WalletController.php
├── DeviceController.php
└── HealthController.php

server/app/Http/Resources/
├── VideoResource.php
├── UserResource.php
├── CommentResource.php
└── NotificationResource.php
```
