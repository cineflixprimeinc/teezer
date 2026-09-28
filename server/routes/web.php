<?php

use App\Http\Controllers\Web\AuthController;
use App\Http\Controllers\Web\HomeController;
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
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Public Website Routes
|--------------------------------------------------------------------------
*/
Route::get('/', [HomeController::class, 'index'])->name('home');

/*
|--------------------------------------------------------------------------
| Auth Routes - guests only
|--------------------------------------------------------------------------
*/
/*
 * Rate limits on the web auth routes.
 *
 * These had NONE. `POST /login` accepted unlimited password guesses, and a successful
 * guess lands on /dashboard/admin/* - which is gated by role only, with no 2FA (the API
 * admin does require 2FA; the Blade one never did). So the web login was an unlimited,
 * unmonitored brute-force path to full admin: ban users, promote roles, change payment
 * settings.
 *
 * The API equivalents have been throttled all along (AppServiceProvider defines the
 * limiters). The web routes were simply never given them.
 */
Route::middleware('guest')->group(function () {
    Route::get('/login',  [AuthController::class, 'showLogin'])->name('login');
    Route::post('/login', [AuthController::class, 'login'])->name('login.post')
        ->middleware('throttle:10,1');   // 10/min per IP - a human logging in, not a script

    Route::get('/register',  [AuthController::class, 'showRegister'])->name('register');
    Route::post('/register', [AuthController::class, 'register'])->name('register.post')
        ->middleware('throttle:5,60');

    Route::get('/forgot-password',  [AuthController::class, 'showForgotPassword'])->name('password.request');
    Route::post('/forgot-password', [AuthController::class, 'sendResetLink'])->name('password.email')
        ->middleware('throttle:5,60');

    Route::get('/reset-password/{token}',  [AuthController::class, 'showResetPassword'])->name('password.reset');
    Route::post('/reset-password',         [AuthController::class, 'resetPassword'])->name('password.update')
        ->middleware('throttle:5,60');
});

/*
|--------------------------------------------------------------------------
| Authenticated - smart redirect to role dashboard
|--------------------------------------------------------------------------
*/
Route::middleware('auth')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout'])->name('logout');
    Route::get('/dashboard', [AuthController::class, 'redirectToDashboard'])->name('dashboard');
});

/*
|--------------------------------------------------------------------------
| Admin Dashboard - REMOVED
|--------------------------------------------------------------------------
|
| The Blade admin panel (dashboard/admin/*) was deleted. It had been returning
| 500 on every page since the product moved to Next.js: layouts/base.blade.php
| calls @vite, and public/build/manifest.json was never generated on the server,
| so no admin page had rendered in about seven weeks.
|
| Administration lives in the Next.js panel, which talks to the /api/v1/admin/*
| routes - those are unaffected, and they already require 2FA.
|
| Deleting it removes an entire authenticated admin surface rather than guarding
| a dead one. Nothing was reachable through it, so nothing is lost.
*/

/*
|--------------------------------------------------------------------------
| Creator Studio - role:creator or admin
|--------------------------------------------------------------------------
*/
Route::middleware(['auth', 'role:creator,admin'])
    ->prefix('dashboard/creator')
    ->name('creator.')
    ->group(function () {
        Route::get('/', [CreatorDashboardController::class, 'index'])->name('index');

        Route::get('/content',              [CreatorContentController::class, 'index'])->name('content.index');
        Route::delete('/content/{id}',      [CreatorContentController::class, 'destroy'])->name('content.destroy');
        Route::post('/content/{id}/publish',[CreatorContentController::class, 'publish'])->name('content.publish');
        Route::post('/content/{id}/archive',[CreatorContentController::class, 'archive'])->name('content.archive');

        Route::get('/analytics',   [CreatorAnalyticsController::class, 'index'])->name('analytics.index');
        Route::get('/monetization',[CreatorMonetizationController::class, 'index'])->name('monetization.index');

        Route::get('/verification',        [CreatorVerificationController::class, 'index'])->name('verification.index');
        Route::post('/verification/apply', [CreatorVerificationController::class, 'apply'])->name('verification.apply');

        Route::get('/settings',  [CreatorSettingsController::class, 'index'])->name('settings.index');
        Route::post('/settings', [CreatorSettingsController::class, 'update'])->name('settings.update');
    });

/*
|--------------------------------------------------------------------------
| User Dashboard - all authenticated roles
|--------------------------------------------------------------------------
*/
Route::middleware(['auth', 'role:user,creator,admin'])
    ->prefix('dashboard/user')
    ->name('user.')
    ->group(function () {
        Route::get('/',       [UserDashboardController::class, 'index'])->name('index');
        Route::get('/saved',  [UserSavedController::class, 'index'])->name('saved.index');
        Route::get('/history',[UserHistoryController::class, 'index'])->name('history.index');
        Route::get('/settings',  [UserSettingsController::class, 'index'])->name('settings.index');
        Route::post('/settings', [UserSettingsController::class, 'update'])->name('settings.update');
    });
