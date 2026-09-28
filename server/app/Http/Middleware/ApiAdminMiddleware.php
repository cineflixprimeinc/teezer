<?php

namespace App\Http\Middleware;

use App\Services\AuthTokenService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * JSON admin guard for /api/v1/admin/* (Sanctum + role check).
 */
class ApiAdminMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);
        }

        if ($user->is_banned) {
            return response()->json([
                'success' => false,
                'message' => 'Your account has been suspended.',
                'code'    => 'ACCOUNT_BANNED',
            ], 403);
        }

        if (!$user->isAdmin()) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        /*
         * TEMPORARY: the admin panel's own 2FA gate can be switched off.
         *
         * ADMIN_2FA_ENFORCED=false lets an admin who HAS 2FA on their account
         * reach the panel without clearing a challenge - which is what makes a
         * demo account usable for walking through the admin UI.
         *
         * This is a deliberate, reversible reduction in security, not a
         * removal: nothing below is deleted, and setting ADMIN_2FA_ENFORCED=true
         * restores the previous behaviour exactly, with no code change and no
         * rebuild. Turn it back on before this is in front of real data.
         *
         * It gates the admin panel ONLY. A user's own 2FA - enrolling,
         * confirming, disabling, recovery codes, and the settings UI on web and
         * mobile - is untouched by this flag and keeps working as before.
         */
        if (! config('auth.admin_two_factor_enforced', true)) {
            return $next($request);
        }

        // Mandatory 2FA for admins, when the switch is on: until they have
        // confirmed a TOTP secret, no admin API works. The /auth/two-factor/*
        // setup endpoints sit outside this group, so an admin can still
        // complete enrollment while locked out of everything else.
        //
        // Off by default (config/auth.php) - 2FA is then opt-in for an admin
        // exactly as it is for a regular account. The enforcement below is
        // unchanged and returns the moment ADMIN_2FA_REQUIRED=true.
        if (config('auth.admin_two_factor_required') && !$user->hasTwoFactorEnabled()) {
            return response()->json([
                'success' => false,
                'message' => 'Two-factor authentication setup is required for admin access.',
                'code'    => 'TWO_FACTOR_SETUP_REQUIRED',
            ], 403);
        }

        // This session must have CLEARED 2FA, not merely belong to an account
        // that has it configured.
        //
        // The website and the app no longer challenge for 2FA - only the admin
        // panel does (ApiAuthController::isAdminClient) - so without this the
        // exemption would leak straight through here: a stolen password gets an
        // unchallenged token from the website, and that token would reach every
        // endpoint below. The panel's prompt would then guard its own UI and
        // nothing else.
        //
        // in_array, not tokenCan: Sanctum grants any ability to a token holding
        // '*', which every login token does, so tokenCan() would answer true
        // for all of them and pass for precisely the sessions this rejects.
        //
        // currentAccessToken() is null on a session-guard request (no bearer
        // token), which cannot have passed a challenge either - the null-safe
        // read yields no abilities and the request is refused.
        if ($user->hasTwoFactorEnabled()) {
            $abilities = (array) ($user->currentAccessToken()?->abilities ?? []);
            if (! in_array(AuthTokenService::TWO_FACTOR_ABILITY, $abilities, true)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Confirm your two-factor code to access the admin panel.',
                    'code'    => 'TWO_FACTOR_REQUIRED',
                ], 403);
            }
        }

        return $next($request);
    }
}
