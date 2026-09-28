# Teezer - Admin Panel Plan

> **URL:** teezer.live/dashboard/admin  
> **Access:** Role = `admin` only  
> **Stack:** Laravel Blade + Tailwind CSS 3 + Alpine.js  
> **Design references:** `assets/design-reference/admin-panel/`

---

## Design System

### Colors

| Token | Value | Usage |
|-------|-------|-------|
| Brand primary | `#fe2c55` | CTA buttons, active nav, badges |
| Brand dark | `#e0243d` | Hover states |
| Page background | `#0a0a0a` | Body / full-page background |
| Surface | `#111111` | Cards, sidebar, modals |
| Surface elevated | `#1a1a1a` | Table rows (hover), dropdowns |
| Border | `rgba(255,255,255,0.08)` | Card borders, dividers |
| Border active | `rgba(255,255,255,0.20)` | Input focus, selected row |
| Text primary | `#ffffff` | Headings, values |
| Text secondary | `rgba(255,255,255,0.60)` | Labels, column headers |
| Text muted | `rgba(255,255,255,0.30)` | Timestamps, helper text |
| Success | `#22c55e` | Active status, approved |
| Warning | `#f59e0b` | Pending status, flagged |
| Danger | `#ef4444` | Banned status, remove actions |
| Info | `#3b82f6` | Creator role badge, info states |

### Typography

| Use | Class |
|-----|-------|
| Page title | `text-xl font-semibold text-white` |
| Section heading | `text-sm font-semibold text-white/50 uppercase tracking-widest` |
| Table header | `text-xs font-semibold text-white/40 uppercase tracking-wider` |
| Table cell | `text-sm text-white` |
| Body / helper | `text-sm text-white/60` |
| Timestamp | `text-xs text-white/30` |

### Spacing

- Sidebar width: `w-64` (256px)
- Top bar height: `h-16` (64px)
- Card padding: `p-5` or `p-6`
- Table cell padding: `px-5 py-3`
- Page content padding: `p-6`

---

## Layout Structure

```
┌──────────────┬────────────────────────────────────────────┐
│              │  Top Bar (h-16)                            │
│  Sidebar     ├────────────────────────────────────────────│
│  (w-64)      │                                            │
│              │  Page Content (scrollable)                 │
│  Logo        │                                            │
│  Nav Links   │  @yield('content')                         │
│              │                                            │
│  User Info   │                                            │
│  Sign Out    │                                            │
└──────────────┴────────────────────────────────────────────┘
```

### Blade Layout: `layouts/admin.blade.php`

```
layouts/
└── admin.blade.php
    ├── <aside> Sidebar
    │   ├── Logo + "Admin" tag
    │   ├── <nav> Navigation links (with active state)
    │   └── User avatar + name + sign out form
    └── <div> Main area
        ├── <header> Top bar with page title + breadcrumb
        └── <main> @yield('content')
```

---

## Sidebar Navigation

| Icon | Label | Route Name | Description |
|------|-------|-----------|-------------|
| Grid | Overview | `admin.index` | Dashboard stats overview |
| Users | Users | `admin.users.index` | User management |
| Video | Videos | `admin.videos.index` | Video moderation |
| Flag | Reports | `admin.reports.index` | Content reports queue |
| Badge | Verification | `admin.verification.index` | Verification requests |
| BarChart | Analytics | `admin.analytics.index` | Platform-wide analytics |
| Settings | Settings | `admin.settings.index` | App settings |

Active state: `bg-[#fe2c55]/10 text-[#fe2c55]`
Inactive state: `text-white/60 hover:text-white hover:bg-white/5`

---

## Pages

---

### 1. Dashboard Overview (`/dashboard/admin`)

**File:** `views/dashboard/admin/index.blade.php`  
**Layout:** `layouts/admin`

#### Stat Cards Row (4 cards)

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Total Users │  │ Total Videos │  │ Banned Users │  │ Pending Rpts │
│  12,480      │  │  84,200      │  │    34        │  │     12       │
│  👥 ↑ 8.2%  │  │  🎬 ↑ 22%   │  │  🚫          │  │  ⚠️          │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

Data from: `users`, `videos`, filtered counts.

#### Quick Actions Bar

- Manage Users → `admin.users.index`
- Review Reports → `admin.reports.index`
- Pending Verification → `admin.verification.index`

#### Recent Registrations Table (last 5 users)

Columns: Avatar · Name/username · Email · Role · Joined · Status

#### Recent Reports Table (last 5 pending)

Columns: Reporter · Content · Reason · Reported At · Actions (Review)

---

### 2. Users (`/dashboard/admin/users`)

**File:** `views/dashboard/admin/users.blade.php`  
**Layout:** `layouts/admin`

#### Filters Bar

- Search input (name, username, email)
- Role filter: All / User / Creator / Admin
- Status filter: All / Active / Banned
- Export CSV button

#### Users Table

| Column | Content |
|--------|---------|
| # | Row number |
| User | Avatar + Name + @username |
| Email | user@example.com |
| Role | Badge (User / Creator / Admin) |
| Status | Badge (Active / Banned) |
| Joined | DD MMM YYYY |
| Actions | View · Ban/Unban · Promote |

- Pagination: 20 per page
- Sortable by: Name, Joined date, Role
- Row click → User detail page

---

### 3. User Detail (`/dashboard/admin/users/{id}`)

**File:** `views/dashboard/admin/users-show.blade.php`  
**Layout:** `layouts/admin`

#### Profile Card

- Large avatar (80px circle)
- Name, @username, email, phone
- Role badge + Status badge
- Joined date, country, bio
- Verification tick if `is_verified`

#### Stats Row

- Total videos · Total followers · Total following · Total likes

#### Actions Panel

- **Ban/Unban** toggle button
- **Promote Role** dropdown (User / Creator / Admin) + Update button
- **Verify/Unverify** toggle (blue tick)
- Future Phase: Send warning, Delete account, View audit log

#### Content Tab

- List of user's videos (thumbnail + caption + views + status)

---

### 4. Videos (`/dashboard/admin/videos`)

**File:** `views/dashboard/admin/videos.blade.php`  
**Layout:** `layouts/admin`

#### Filters Bar

- Search (title, caption, uploader)
- Status filter: All / Published / Removed / Flagged
- Sort: Newest / Most viewed / Most reported

#### Videos Table

| Column | Content |
|--------|---------|
| Thumbnail | 60×80px preview |
| Video | Caption (truncated) + uploader name |
| Status | Badge |
| Views | Formatted count |
| Likes | Formatted count |
| Flagged | Yes/No badge |
| Uploaded | DD MMM YYYY |
| Actions | View · Remove · Restore |

---

### 5. Video Detail (`/dashboard/admin/videos/{id}`)

**File:** `views/dashboard/admin/videos-show.blade.php`  
**Layout:** `layouts/admin`

- Embedded video player (HTML5 video tag, `controls`)
- Caption, hashtags, uploader info
- Engagement stats (views, likes, comments, saves, shares)
- `is_flagged` status + flag reason if set
- Reports list for this video (from `video_reports`)
- Action buttons: Remove · Restore · Remove + Ban Uploader

---

### 6. Reports (`/dashboard/admin/reports`)

**File:** `views/dashboard/admin/reports.blade.php`  
**Layout:** `layouts/admin`

#### Tabs

- Video Reports | User Reports

#### Reports Table

| Column | Content |
|--------|---------|
| Type | Video / User |
| Content | Link to reported content |
| Reason | Reason badge |
| Reporter | @username |
| Reported At | Relative time |
| Status | Pending / Reviewed / Dismissed / Actioned |
| Actions | Review · Dismiss · Action |

"Action" on a video report: removes the video. On a user report: option to ban.
"Reviewed by" is logged as admin's user ID in `reviewed_by` column.

---

### 7. Verification (`/dashboard/admin/verification`)

**File:** `views/dashboard/admin/verification.blade.php`  
**Layout:** `layouts/admin`

#### Tabs

- Pending | Approved | Rejected

#### Table

| Column | Content |
|--------|---------|
| User | Avatar + @username |
| Category | Creator / Public Figure / Business |
| Submitted | Date |
| Document | Link to uploaded document |
| Status | Badge |
| Actions | Approve · Reject (with reason textarea) |

---

### 8. Analytics (`/dashboard/admin/analytics`)

**File:** `views/dashboard/admin/analytics.blade.php`  
**Layout:** `layouts/admin`

#### Period Selector

7 days · 30 days · 90 days · 1 year

#### Platform Metrics Cards

- Total new users (period)
- Total new videos (period)
- Total views (period)
- Total watch time hours (period)

#### Charts (Phase 7, using Chart.js or similar)

- Daily new users (line chart)
- Daily new videos (bar chart)
- Top hashtags (horizontal bar)
- Top countries by users (bar chart)

#### Top Content Table

- Top 10 videos by views in the period

---

### 9. Settings (`/dashboard/admin/settings`)

**File:** `views/dashboard/admin/settings.blade.php`  
**Layout:** `layouts/admin`

#### Sections

| Section | Fields |
|---------|--------|
| App Info | App name, support email, contact URL |
| Registration | Allow new registrations toggle |
| Video Limits | Max video duration (seconds), max file size (MB) |
| Content Policy | Allowed MIME types |
| Maintenance | Maintenance mode toggle |

All settings stored in a `settings` key-value table (Phase 9).

---

## Blade Component Library

All reusable UI elements are Blade components in `resources/views/components/`:

| Component | File | Usage |
|-----------|------|-------|
| Stat card | `stat-card.blade.php` | `<x-stat-card label="Total Users" value="12,480" icon="👥" />` |
| Status badge | `status-badge.blade.php` | `<x-status-badge status="banned" />` |
| Role badge | `role-badge.blade.php` | `<x-role-badge role="creator" />` |
| Action button | `action-btn.blade.php` | `<x-action-btn href="..." label="View" />` |
| Confirm modal | `confirm-modal.blade.php` | `<x-confirm-modal id="ban-modal" action="..." />` |
| Data table | `data-table.blade.php` | Wraps `<table>` with consistent styling |
| Search filter | `search-filter.blade.php` | Search + filter bar |
| Pagination | `pagination.blade.php` | Tailwind-styled pagination |
| Alert | `alert.blade.php` | Success / error flash messages |
| Empty state | `empty-state.blade.php` | When table has no results |

---

## Controller Map (Admin)

| Controller | Location | Methods |
|-----------|----------|---------|
| `AdminDashboardController` | `Dashboard/Admin/` | `index` |
| `AdminUserController` | `Dashboard/Admin/` | `index`, `show`, `ban`, `unban`, `promote`, `verify` |
| `AdminVideoController` | `Dashboard/Admin/` | `index`, `show`, `remove`, `restore` |
| `AdminReportController` | `Dashboard/Admin/` | `index`, `action`, `dismiss` |
| `AdminVerificationController` | `Dashboard/Admin/` | `index`, `approve`, `reject` |
| `AdminModerationController` | `Dashboard/Admin/` | `index`, `keepContent`, `removeContent`, `escalate` |
| `AdminCreatorController` | `Dashboard/Admin/` | `index`, `show` |
| `AdminFeedController` | `Dashboard/Admin/` | `index`, `update` |
| `AdminPlaylistController` | `Dashboard/Admin/` | `index`, `store`, `update`, `destroy` |
| `AdminNotificationController` | `Dashboard/Admin/` | `index`, `store` |
| `AdminAuditController` | `Dashboard/Admin/` | `index` |
| `AdminSystemController` | `Dashboard/Admin/` | `index`, `update` |
| `AdminRoleController` | `Dashboard/Admin/` | `index` |
| `AdminAnalyticsController` | `Dashboard/Admin/` | `index` |
| `AdminSettingsController` | `Dashboard/Admin/` | `index`, `update` |

---

## Route Structure (Admin)

```php
Route::middleware(['auth', 'role:admin'])
    ->prefix('dashboard/admin')
    ->name('admin.')
    ->group(function () {
        Route::get('/',                          [AdminDashboardController::class, 'index'])->name('index');

        // Users
        Route::get('/users',                     [AdminUserController::class, 'index'])->name('users.index');
        Route::get('/users/{id}',               [AdminUserController::class, 'show'])->name('users.show');
        Route::post('/users/{id}/ban',          [AdminUserController::class, 'ban'])->name('users.ban');
        Route::post('/users/{id}/unban',        [AdminUserController::class, 'unban'])->name('users.unban');
        Route::post('/users/{id}/promote',      [AdminUserController::class, 'promote'])->name('users.promote');
        Route::post('/users/{id}/verify',       [AdminUserController::class, 'verify'])->name('users.verify');

        // Videos
        Route::get('/videos',                   [AdminVideoController::class, 'index'])->name('videos.index');
        Route::get('/videos/{id}',              [AdminVideoController::class, 'show'])->name('videos.show');
        Route::post('/videos/{id}/remove',      [AdminVideoController::class, 'remove'])->name('videos.remove');
        Route::post('/videos/{id}/restore',     [AdminVideoController::class, 'restore'])->name('videos.restore');

        // Reports
        Route::get('/reports',                  [AdminReportController::class, 'index'])->name('reports.index');
        Route::post('/reports/{id}/action',     [AdminReportController::class, 'action'])->name('reports.action');
        Route::post('/reports/{id}/dismiss',    [AdminReportController::class, 'dismiss'])->name('reports.dismiss');

        // Verification
        Route::get('/verification',             [AdminVerificationController::class, 'index'])->name('verification.index');
        Route::post('/verification/{id}/approve',[AdminVerificationController::class, 'approve'])->name('verification.approve');
        Route::post('/verification/{id}/reject', [AdminVerificationController::class, 'reject'])->name('verification.reject');

        // Analytics
        Route::get('/analytics',                [AdminAnalyticsController::class, 'index'])->name('analytics.index');

        // Settings
        Route::get('/settings',                 [AdminSettingsController::class, 'index'])->name('settings.index');
        Route::post('/settings',                [AdminSettingsController::class, 'update'])->name('settings.update');

        // Content Moderation
        Route::get('/moderation',               [AdminModerationController::class, 'index'])->name('moderation.index');
        Route::post('/moderation/{id}/keep',    [AdminModerationController::class, 'keepContent'])->name('moderation.keep');
        Route::post('/moderation/{id}/remove',  [AdminModerationController::class, 'removeContent'])->name('moderation.remove');
        Route::post('/moderation/{id}/escalate',[AdminModerationController::class, 'escalate'])->name('moderation.escalate');

        // Feed Control
        Route::get('/feed',  [AdminFeedController::class, 'index'])->name('feed.index');
        Route::post('/feed', [AdminFeedController::class, 'update'])->name('feed.update');

        // Creators
        Route::get('/creators',     [AdminCreatorController::class, 'index'])->name('creators.index');
        Route::get('/creators/{id}',[AdminCreatorController::class, 'show'])->name('creators.show');

        // Playlists
        Route::get('/playlists',         [AdminPlaylistController::class, 'index'])->name('playlists.index');
        Route::post('/playlists',        [AdminPlaylistController::class, 'store'])->name('playlists.store');
        Route::put('/playlists/{id}',    [AdminPlaylistController::class, 'update'])->name('playlists.update');
        Route::delete('/playlists/{id}', [AdminPlaylistController::class, 'destroy'])->name('playlists.destroy');

        // Notifications
        Route::get('/notifications',  [AdminNotificationController::class, 'index'])->name('notifications.index');
        Route::post('/notifications', [AdminNotificationController::class, 'store'])->name('notifications.store');

        // Audit Log
        Route::get('/audit', [AdminAuditController::class, 'index'])->name('audit.index');

        // System Config
        Route::get('/system',  [AdminSystemController::class, 'index'])->name('system.index');
        Route::post('/system', [AdminSystemController::class, 'update'])->name('system.update');

        // Roles
        Route::get('/roles', [AdminRoleController::class, 'index'])->name('roles.index');
    });
```

> **Note:** Route structure above reflects Phase 6 implementation. The `web.php` file is the authoritative source; this section documents intent for reference.

---

## Blade View File Map

```
resources/views/
├── layouts/
│   ├── base.blade.php              ← HTML shell (meta, Vite assets)
│   ├── admin.blade.php             ← Sidebar + top bar layout
│   ├── creator.blade.php           ← Creator sidebar layout
│   ├── user.blade.php              ← User top nav layout
│   ├── auth.blade.php              ← Centered card layout (login/register)
│   └── website.blade.php          ← Public nav + footer
├── components/
│   ├── stat-card.blade.php
│   ├── status-badge.blade.php
│   ├── role-badge.blade.php
│   ├── action-btn.blade.php
│   ├── confirm-modal.blade.php
│   ├── data-table.blade.php
│   ├── search-filter.blade.php
│   ├── pagination.blade.php
│   ├── alert.blade.php
│   └── empty-state.blade.php
├── dashboard/
│   ├── admin/
│   │   ├── index.blade.php          ← Overview (real stats - Phase 6)
│   │   ├── users.blade.php          ← User list with search/filter (Phase 6)
│   │   ├── users-show.blade.php     ← User detail with actions (Phase 6)
│   │   ├── videos.blade.php         ← Video list with moderation (Phase 6)
│   │   ├── videos-show.blade.php    ← Video detail with reports (Phase 6)
│   │   ├── reports.blade.php        ← Reports queue with actions (Phase 6)
│   │   ├── verification.blade.php   ← Verification queue (Phase 6)
│   │   ├── audit.blade.php          ← Audit log with filters (Phase 6)
│   │   ├── system.blade.php         ← System config from app_settings (Phase 6)
│   │   ├── notifications.blade.php  ← Broadcast notifications (Phase 6)
│   │   ├── creators.blade.php       ← Creator list (Phase 6)
│   │   ├── creators-show.blade.php  ← Creator profile with analytics (Phase 6)
│   │   ├── playlists.blade.php      ← Playlist CRUD (Phase 6)
│   │   ├── moderation.blade.php     ← Flagged content queue (Phase 6)
│   │   ├── feed.blade.php           ← Feed algorithm weights (Phase 6)
│   │   ├── roles.blade.php          ← Role & permission matrix (Phase 6)
│   │   ├── monetization.blade.php   ← Monetization settings (Phase 6)
│   │   ├── analytics.blade.php      ← Platform analytics (Phase 7 - charts)
│   │   └── settings.blade.php       ← Admin settings
│   ├── creator/
│   │   ├── index.blade.php
│   │   ├── content.blade.php
│   │   ├── analytics.blade.php
│   │   ├── monetization.blade.php
│   │   ├── verification.blade.php
│   │   └── settings.blade.php
│   └── user/
│       ├── index.blade.php
│       ├── saved.blade.php
│       ├── history.blade.php
│       └── settings.blade.php
├── auth/
│   ├── login.blade.php
│   ├── register.blade.php
│   └── forgot-password.blade.php
├── website/
│   └── home.blade.php
└── errors/
    ├── 403.blade.php
    └── 404.blade.php
```

---

## Alpine.js Interactions

Alpine.js (CDN or bundled) handles lightweight frontend interactivity:

| Interaction | Alpine directive | Usage |
|-------------|-----------------|-------|
| Ban confirmation | `x-data`, `x-show`, `@click` | Show/hide confirm modal before ban action |
| Promote dropdown | `x-data`, `x-show` | Show role selector dropdown |
| Tab switching | `x-data`, `:class` | Reports: Video Reports / User Reports tabs |
| Period selector | `x-data`, `@change` | Analytics period picker |
| Sidebar collapse | `x-data`, `x-bind:class` | Collapsible sidebar on mobile |
| Search filter | `x-model`, `@input` | Client-side table filter (Phase 9 enhancement) |

---

## Design Reference Placement

When you have design screenshots for the admin panel:

1. Copy images to `assets/design-reference/admin-panel/<page>/`
2. Update `assets/design-reference/admin-panel/CATALOG.md` with the file entry
3. Reference them when building the corresponding Blade view

Example:
```
assets/design-reference/admin-panel/
├── dashboard/admin-overview.png
├── users/users-table.png
├── users/users-detail.png
├── reports/reports-queue.png
└── components/sidebar/sidebar-expanded.png
```
