# Teezer - Role-Based Login Plan

> This document covers the entire authentication and role-routing system for the web dashboard and website.  
> The Flutter API uses Sanctum tokens - that is covered in `api-plan.md`.  
> This plan covers: single login page → role detection → middleware → dashboard routing.

---

## Core Principle

There is **one `users` table** and **one login page** for all roles. No separate admin login URL.  
The `users.role` column (`'user'`, `'creator'`, `'admin'`) controls what dashboard the user sees after login.

The web system uses **Laravel's default session guard** (cookie-based). The API uses **Sanctum token guard** (Bearer token). These are independent and do not interfere.

---

## Role Definitions

| Role | Value in DB | Dashboard URL | Description |
|---|---|---|---|
| Regular user | `user` | `/dashboard/user` | Consumers of content |
| Creator | `creator` | `/dashboard/creator` | Content uploaders |
| Admin | `admin` | `/dashboard/admin` | Platform moderators |

A user can be promoted to `creator` or `admin` by an existing admin through the admin dashboard.

---

## URL Map

| URL | Guard | Description |
|---|---|---|
| `/login` | Guest only | Shared login page |
| `/register` | Guest only | User signup |
| `/forgot-password` | Guest only | Password reset request |
| `/dashboard` | Auth | Smart redirect based on role |
| `/dashboard/admin/*` | Auth + role:admin | Admin panel |
| `/dashboard/creator/*` | Auth + role:creator | Creator Studio |
| `/dashboard/user/*` | Auth + role:user | User home |
| `/logout` | Auth | POST - destroys session |

---

## Login Flow

```
User visits teezer.live/login
        │
        ▼
[LoginController@showLogin]  →  Returns Blade login view
        │
User submits email + password
        │
        ▼
[LoginController@login]
  1. Validate input (email/username + password)
  2. Attempt auth via Auth::attempt()
  3. If fails → back with error
  4. If banned → back with "Your account has been suspended."
  5. If succeeds → regenerate session → redirect to /dashboard
        │
        ▼
[/dashboard route]  →  Middleware 'auth' passes
        │
        ▼
Match auth()->user()->role:
  'admin'    →  redirect('/dashboard/admin')
  'creator'  →  redirect('/dashboard/creator')
  default    →  redirect('/dashboard/user')
```

---

## Laravel Guards Configuration

**`config/auth.php`** (relevant sections):

```php
'defaults' => [
    'guard'     => 'web',       // Session auth for web (dashboard, website)
    'passwords' => 'users',
],

'guards' => [
    'web' => [
        'driver'   => 'session',
        'provider' => 'users',
    ],
    'api' => [
        // Handled by Sanctum - configured via Sanctum's defaults
        'driver'   => 'sanctum',
        'provider' => 'users',
    ],
],

'providers' => [
    'users' => [
        'driver' => 'eloquent',
        'model'  => App\Models\User::class,
    ],
],
```

---

## Middleware

### 1. RoleMiddleware

**`app/Http/Middleware/RoleMiddleware.php`**

```php
namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class RoleMiddleware
{
    public function handle(Request $request, Closure $next, string ...$roles): mixed
    {
        if (!auth()->check()) {
            return redirect('/login');
        }

        if (!in_array(auth()->user()->role, $roles)) {
            abort(403, 'Access denied.');
        }

        if (auth()->user()->is_banned) {
            auth()->logout();
            $request->session()->invalidate();
            return redirect('/login')->with('error', 'Your account has been suspended.');
        }

        return $next($request);
    }
}
```

Register in **`bootstrap/app.php`** (Laravel 11):

```php
->withMiddleware(function (Middleware $middleware) {
    $middleware->alias([
        'role' => \App\Http\Middleware\RoleMiddleware::class,
    ]);
})
```

### 2. RedirectIfAuthenticated (Guest Middleware)

Laravel's built-in `guest` middleware redirects logged-in users away from `/login` and `/register`. Update it to redirect to `/dashboard` instead of `/home`:

**`app/Http/Middleware/RedirectIfAuthenticated.php`**

```php
public function handle(Request $request, Closure $next, string ...$guards): Response
{
    foreach ($guards as $guard) {
        if (Auth::guard($guard)->check()) {
            return redirect('/dashboard');
        }
    }
    return $next($request);
}
```

### 3. EnsureEmailVerified (optional, Phase 5+)

Can be added to dashboard routes to require email verification before accessing the dashboard:

```php
Route::middleware(['auth', 'verified', 'role:creator'])->prefix('dashboard/creator')...
```

---

## Route Structure (`routes/web.php`)

```php
<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Web\AuthController;
use App\Http\Controllers\Web\WebController;
use App\Http\Controllers\Dashboard\Admin\AdminDashboardController;
use App\Http\Controllers\Dashboard\Admin\AdminUserController;
use App\Http\Controllers\Dashboard\Admin\AdminVideoController;
use App\Http\Controllers\Dashboard\Admin\AdminReportController;
use App\Http\Controllers\Dashboard\Admin\AdminVerificationController;
use App\Http\Controllers\Dashboard\Admin\AdminAnalyticsController;
use App\Http\Controllers\Dashboard\Admin\AdminSettingsController;
use App\Http\Controllers\Dashboard\Creator\CreatorDashboardController;
use App\Http\Controllers\Dashboard\Creator\CreatorContentController;
use App\Http\Controllers\Dashboard\Creator\CreatorAnalyticsController;
use App\Http\Controllers\Dashboard\Creator\CreatorMonetizationController;
use App\Http\Controllers\Dashboard\Creator\CreatorVerificationController;
use App\Http\Controllers\Dashboard\Creator\CreatorSettingsController;
use App\Http\Controllers\Dashboard\User\UserDashboardController;
use App\Http\Controllers\Dashboard\User\UserSavedController;
use App\Http\Controllers\Dashboard\User\UserHistoryController;
use App\Http\Controllers\Dashboard\User\UserSettingsController;

// ─── Public Website ────────────────────────────────────────────
Route::get('/', [WebController::class, 'home'])->name('home');
Route::get('/about', [WebController::class, 'about'])->name('about');
Route::get('/download', [WebController::class, 'download'])->name('download');
Route::get('/privacy', [WebController::class, 'privacy'])->name('privacy');
Route::get('/terms', [WebController::class, 'terms'])->name('terms');
Route::get('/contact', [WebController::class, 'contact'])->name('contact');
Route::post('/contact', [WebController::class, 'sendContact'])->name('contact.send');

// ─── Auth (guest only) ─────────────────────────────────────────
Route::middleware('guest')->group(function () {
    Route::get('/login', [AuthController::class, 'showLogin'])->name('login');
    Route::post('/login', [AuthController::class, 'login']);
    Route::get('/register', [AuthController::class, 'showRegister'])->name('register');
    Route::post('/register', [AuthController::class, 'register']);
    Route::get('/forgot-password', [AuthController::class, 'showForgotPassword'])->name('password.request');
    Route::post('/forgot-password', [AuthController::class, 'sendResetLink'])->name('password.email');
    Route::get('/reset-password/{token}', [AuthController::class, 'showResetPassword'])->name('password.reset');
    Route::post('/reset-password', [AuthController::class, 'resetPassword'])->name('password.update');
});

// Logout (auth required)
Route::post('/logout', [AuthController::class, 'logout'])->middleware('auth')->name('logout');

// ─── Smart Dashboard Redirect ──────────────────────────────────
Route::middleware('auth')->get('/dashboard', function () {
    return match(auth()->user()->role) {
        'admin'   => redirect()->route('dashboard.admin'),
        'creator' => redirect()->route('dashboard.creator'),
        default   => redirect()->route('dashboard.user'),
    };
})->name('dashboard');

// ─── Admin Dashboard ───────────────────────────────────────────
Route::middleware(['auth', 'role:admin'])
    ->prefix('dashboard/admin')
    ->name('dashboard.admin.')
    ->group(function () {
        Route::get('/', [AdminDashboardController::class, 'index'])->name('index');
        Route::get('/users', [AdminUserController::class, 'index'])->name('users');
        Route::get('/users/{id}', [AdminUserController::class, 'show'])->name('users.show');
        Route::post('/users/{id}/ban', [AdminUserController::class, 'ban'])->name('users.ban');
        Route::post('/users/{id}/unban', [AdminUserController::class, 'unban'])->name('users.unban');
        Route::post('/users/{id}/promote', [AdminUserController::class, 'promote'])->name('users.promote');
        Route::get('/videos', [AdminVideoController::class, 'index'])->name('videos');
        Route::get('/videos/{id}', [AdminVideoController::class, 'show'])->name('videos.show');
        Route::post('/videos/{id}/remove', [AdminVideoController::class, 'remove'])->name('videos.remove');
        Route::post('/videos/{id}/restore', [AdminVideoController::class, 'restore'])->name('videos.restore');
        Route::get('/reports', [AdminReportController::class, 'index'])->name('reports');
        Route::post('/reports/{id}/action', [AdminReportController::class, 'action'])->name('reports.action');
        Route::post('/reports/{id}/dismiss', [AdminReportController::class, 'dismiss'])->name('reports.dismiss');
        Route::get('/verification', [AdminVerificationController::class, 'index'])->name('verification');
        Route::post('/verification/{id}/approve', [AdminVerificationController::class, 'approve'])->name('verification.approve');
        Route::post('/verification/{id}/reject', [AdminVerificationController::class, 'reject'])->name('verification.reject');
        Route::get('/analytics', [AdminAnalyticsController::class, 'index'])->name('analytics');
        Route::get('/settings', [AdminSettingsController::class, 'index'])->name('settings');
        Route::post('/settings', [AdminSettingsController::class, 'update'])->name('settings.update');
    });

// First route name used as redirect target
Route::get('/dashboard/admin', function () { return redirect()->route('dashboard.admin.index'); })->name('dashboard.admin');

// ─── Creator Studio ────────────────────────────────────────────
Route::middleware(['auth', 'role:creator,admin'])
    ->prefix('dashboard/creator')
    ->name('dashboard.creator.')
    ->group(function () {
        Route::get('/', [CreatorDashboardController::class, 'index'])->name('index');
        Route::get('/content', [CreatorContentController::class, 'index'])->name('content');
        Route::delete('/content/{id}', [CreatorContentController::class, 'destroy'])->name('content.delete');
        Route::post('/content/{id}/publish', [CreatorContentController::class, 'publish'])->name('content.publish');
        Route::post('/content/{id}/archive', [CreatorContentController::class, 'archive'])->name('content.archive');
        Route::get('/analytics', [CreatorAnalyticsController::class, 'index'])->name('analytics');
        Route::get('/monetization', [CreatorMonetizationController::class, 'index'])->name('monetization');
        Route::get('/verification', [CreatorVerificationController::class, 'index'])->name('verification');
        Route::post('/verification/apply', [CreatorVerificationController::class, 'apply'])->name('verification.apply');
        Route::get('/settings', [CreatorSettingsController::class, 'index'])->name('settings');
        Route::post('/settings', [CreatorSettingsController::class, 'update'])->name('settings.update');
    });

Route::get('/dashboard/creator', function () { return redirect()->route('dashboard.creator.index'); })->name('dashboard.creator');

// ─── User Dashboard ────────────────────────────────────────────
Route::middleware(['auth', 'role:user,creator,admin'])
    ->prefix('dashboard/user')
    ->name('dashboard.user.')
    ->group(function () {
        Route::get('/', [UserDashboardController::class, 'index'])->name('index');
        Route::get('/saved', [UserSavedController::class, 'index'])->name('saved');
        Route::get('/history', [UserHistoryController::class, 'index'])->name('history');
        Route::get('/settings', [UserSettingsController::class, 'index'])->name('settings');
        Route::post('/settings', [UserSettingsController::class, 'update'])->name('settings.update');
    });

Route::get('/dashboard/user', function () { return redirect()->route('dashboard.user.index'); })->name('dashboard.user');
```

---

## AuthController Logic

**`app/Http/Controllers/Web/AuthController.php`**

```php
public function login(Request $request): RedirectResponse
{
    $request->validate([
        'email'    => 'required|string',
        'password' => 'required|string',
    ]);

    // Accept email or username
    $field = filter_var($request->email, FILTER_VALIDATE_EMAIL) ? 'email' : 'username';

    $credentials = [
        $field     => $request->email,
        'password' => $request->password,
    ];

    if (!Auth::attempt($credentials, $request->boolean('remember'))) {
        return back()->withErrors([
            'email' => 'The credentials do not match our records.',
        ])->onlyInput('email');
    }

    $user = Auth::user();

    if ($user->is_banned) {
        Auth::logout();
        return back()->withErrors([
            'email' => 'Your account has been suspended. Contact support.',
        ]);
    }

    $request->session()->regenerate();

    return redirect()->intended('/dashboard');
}

public function logout(Request $request): RedirectResponse
{
    Auth::logout();
    $request->session()->invalidate();
    $request->session()->regenerateToken();
    return redirect('/login');
}
```

---

## Dashboard Layouts (Blade)

Three separate Blade layout files - each inherits from a base HTML shell:

```
resources/views/
├── layouts/
│   ├── base.blade.php          ← HTML shell (head, meta, Tailwind CSS, JS)
│   ├── admin.blade.php         ← Extends base, adds admin sidebar + top bar
│   ├── creator.blade.php       ← Extends base, adds creator sidebar + top bar
│   ├── user.blade.php          ← Extends base, adds user top navbar
│   └── website.blade.php       ← Extends base, adds public header + footer
├── auth/
│   ├── login.blade.php
│   ├── register.blade.php
│   └── forgot-password.blade.php
├── website/
│   ├── home.blade.php
│   ├── about.blade.php
│   ├── download.blade.php
│   ├── privacy.blade.php
│   ├── terms.blade.php
│   └── contact.blade.php
├── dashboard/
│   ├── admin/
│   │   ├── index.blade.php     ← Admin overview
│   │   ├── users.blade.php
│   │   ├── users-show.blade.php
│   │   ├── videos.blade.php
│   │   ├── reports.blade.php
│   │   ├── verification.blade.php
│   │   ├── analytics.blade.php
│   │   └── settings.blade.php
│   ├── creator/
│   │   ├── index.blade.php     ← Creator Studio overview
│   │   ├── content.blade.php
│   │   ├── analytics.blade.php
│   │   ├── monetization.blade.php
│   │   ├── verification.blade.php
│   │   └── settings.blade.php
│   └── user/
│       ├── index.blade.php     ← User home
│       ├── saved.blade.php
│       ├── history.blade.php
│       └── settings.blade.php
└── components/
    ├── sidebar-admin.blade.php
    ├── sidebar-creator.blade.php
    ├── topbar.blade.php
    ├── stat-card.blade.php
    ├── data-table.blade.php
    ├── status-badge.blade.php
    ├── confirm-modal.blade.php
    └── pagination.blade.php
```

---

## User Model - Role Helper Methods

**`app/Models/User.php`**

```php
public function isAdmin(): bool
{
    return $this->role === 'admin';
}

public function isCreator(): bool
{
    return $this->role === 'creator';
}

public function isUser(): bool
{
    return $this->role === 'user';
}

public function getDashboardRoute(): string
{
    return match($this->role) {
        'admin'   => '/dashboard/admin',
        'creator' => '/dashboard/creator',
        default   => '/dashboard/user',
    };
}
```

---

## Permission System (Phase 3)

Permissions are returned as an array from `User::getPermissions()` and included in all auth responses (login, register, token refresh). The Flutter app uses them to conditionally render UI surfaces.

### Permission → Role mapping

| Permission | Admin | Creator | User |
|---|:---:|:---:|:---:|
| `access_admin_panel` | ✅ | - | - |
| `access_creator_studio` | ✅ | ✅ | - |
| `access_feed` | ✅ | ✅ | ✅ |
| `manage_users` | ✅ | - | - |
| `manage_creators` | ✅ | - | - |
| `manage_own_profile` | ✅ | ✅ | ✅ |
| `manage_videos` | ✅ | - | - |
| `manage_own_content` | ✅ | ✅ | ✅ |
| `basic_uploads` | ✅ | ✅ | ✅ |
| `manage_reports` | ✅ | - | - |
| `manage_moderation` | ✅ | - | - |
| `manage_verification` | ✅ | - | - |
| `request_verification` | ✅ | ✅ | - |
| `manage_monetization` | ✅ | - | - |
| `view_monetization` | ✅ | ✅ | - |
| `manage_feed` | ✅ | - | - |
| `manage_settings` | ✅ | - | - |
| `manage_roles` | ✅ | - | - |
| `manage_notifications` | ✅ | - | - |
| `view_analytics` | ✅ | - | - |
| `view_own_analytics` | ✅ | ✅ | - |
| `view_audit_log` | ✅ | - | - |

### Usage in code

```php
// Check a single permission
if ($user->hasPermission('manage_users')) {
    // allowed
}

// Get all permissions for API response
$permissions = $user->getPermissions();
```

### Usage in Blade

```blade
@if(auth()->user()->hasPermission('access_admin_panel'))
    <a href="/dashboard/admin">Admin Panel</a>
@endif
```

---

## Security Considerations

| Risk | Mitigation |
|---|---|
| Role escalation via URL | `RoleMiddleware` enforces role on every request, not just login |
| Session fixation | `$request->session()->regenerate()` after successful login |
| CSRF | Laravel's default CSRF middleware active on all web routes |
| Brute force | Rate limit login route (10 req/min per IP via middleware) |
| Banned user access | `RoleMiddleware` checks `is_banned` on every authenticated request |
| Admin URL enumeration | No separate `/admin` login URL - all roles use `/login` |
| Mass assignment | User model uses `$fillable`, not `$guarded = []` |
| Token leakage | Web dashboard uses sessions (HTTP-only cookie), not localStorage |

---

## Promotion Flow (Admin Action)

An admin can promote a user's role via the admin dashboard:

```
Admin → /dashboard/admin/users/{id} → click "Promote to Creator"
      → POST /dashboard/admin/users/{id}/promote
      → body: { role: 'creator' }
      → AdminUserController@promote validates role value
      → Updates users.role in DB
      → User's next web login will redirect to /dashboard/creator
      → User's existing API tokens remain valid (Sanctum uses same users table)
```

The Flutter app always calls `/auth/me` on startup and re-checks the role field from the API response. If the role changed, the app can update the local user state accordingly.

---

## Flutter + Web Auth Coexistence

Both auth systems use the `users` table. They do NOT share sessions or tokens.

| Aspect | Web (Dashboard) | Flutter (API) |
|---|---|---|
| Auth method | Session cookie (`web` guard) | Bearer token (`sanctum` guard) |
| Login endpoint | `POST /login` (web form) | `POST /api/v1/auth/login` (JSON) |
| Token storage | HTTP-only session cookie (browser) | `SharedPreferences` (device) |
| Logout | `POST /logout` → session destroyed | `POST /api/v1/auth/logout` → token revoked |
| Role enforcement | `RoleMiddleware` on web routes | Role included in `/auth/me` response (app-side logic) |

A user can be logged into both simultaneously with no conflict.
