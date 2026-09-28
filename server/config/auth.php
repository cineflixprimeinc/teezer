<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Mandatory two-factor for admin accounts
    |--------------------------------------------------------------------------
    | When true, ApiAdminMiddleware refuses every /admin endpoint until the
    | account has confirmed a TOTP secret, and the admin panel funnels the user
    | to /security to enrol. When false, 2FA stays available but is opt-in for
    | an admin exactly as it is for a regular account.
    |
    | Defaults to false by request. Worth knowing what that costs: the admin
    | panel controls bans, payouts, coin balances and user data, so with the
    | gate off a single leaked admin password is total control. Set
    | ADMIN_2FA_REQUIRED=true to put it back - nothing was deleted.
    */
    'admin_two_factor_required' => (bool) env('ADMIN_2FA_REQUIRED', false),

    /*
    |--------------------------------------------------------------------------
    | Admin panel 2FA gate  (TEMPORARILY DISABLED)
    |--------------------------------------------------------------------------
    |
    | Separate from admin_two_factor_required above, and the one that actually
    | gates access today. That flag only forces ENROLMENT; this one decides
    | whether an admin who already has 2FA must CLEAR a challenge before the
    | panel will answer.
    |
    | Currently false, by request, so a demo account can walk through the admin
    | UI without a TOTP device. That is a real reduction in security and it is
    | meant to be temporary: the admin panel controls bans, payouts, coin
    | balances and user data, so with this off a single leaked admin password is
    | total control.
    |
    | Nothing was deleted to achieve it. Set ADMIN_2FA_ENFORCED=true and the
    | previous behaviour returns exactly, with no code change and no rebuild.
    |
    | This gates the admin panel ONLY. A user's own 2FA - enrol, confirm,
    | disable, recovery codes, and the settings UI on web and mobile - is
    | unaffected and keeps working.
    */
    'admin_two_factor_enforced' => (bool) env('ADMIN_2FA_ENFORCED', false),

    'defaults' => [
        'guard' => env('AUTH_GUARD', 'web'),
        'passwords' => env('AUTH_PASSWORD_BROKER', 'users'),
    ],

    'guards' => [
        // Session guard - used by web dashboard and website
        'web' => [
            'driver' => 'session',
            'provider' => 'users',
        ],
        // Sanctum token guard - used by Flutter API
        'api' => [
            'driver' => 'sanctum',
            'provider' => 'users',
        ],
    ],

    'providers' => [
        'users' => [
            'driver' => 'eloquent',
            'model' => env('AUTH_MODEL', App\Models\User::class),
        ],
    ],

    'passwords' => [
        'users' => [
            'provider' => 'users',
            'table' => env('AUTH_PASSWORD_RESET_TOKEN_TABLE', 'password_reset_tokens'),
            'expire' => 60,
            'throttle' => 60,
        ],
    ],

    'password_timeout' => env('AUTH_PASSWORD_TIMEOUT', 10800),
];
