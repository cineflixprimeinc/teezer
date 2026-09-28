<?php

return [
    /*
     * Stateful domains for web dashboard (session-based auth).
     * The Flutter app uses token auth and does NOT need to be listed here.
     */
    'stateful' => array_values(array_filter(array_unique(array_map('trim', explode(',', env(
        'SANCTUM_STATEFUL_DOMAINS',
        implode(',', array_filter([
            'localhost',
            'localhost:3000',
            'localhost:8000',
            '127.0.0.1',
            '127.0.0.1:8000',
            '::1',
            parse_url(env('APP_URL', ''), PHP_URL_HOST) ?: null,
            'teezer.live',
            'www.teezer.live',
            'backend.teezer.live',
            'api.teezer.live',
        ]))
    )))))),

    'guard' => ['web'],

    /*
     * Token expiry - null means tokens never expire.
     * Set to minutes, e.g. 60 * 24 * 30 = 30 days.
     */
    'expiration' => (int) env('SANCTUM_EXPIRATION', 60 * 24 * 30),

    'token_prefix' => env('SANCTUM_TOKEN_PREFIX', ''),

    'middleware' => [
        'authenticate_session' => Laravel\Sanctum\Http\Middleware\AuthenticateSession::class,
        'encrypt_cookies' => Illuminate\Cookie\Middleware\EncryptCookies::class,
        'validate_csrf_token' => Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class,
    ],
];
