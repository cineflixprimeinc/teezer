<?php

/*
 * Internal Reelsoo Single Sign-On.
 *
 * A shared, revocable session cookie scoped to `.reelsoo.com` lets a user who is
 * signed in on any Reelsoo subdomain be recognized on the others (ads, studio, …)
 * without a second account. Bearer-token auth for the API is unchanged; this only
 * adds cross-subdomain recognition + an OAuth-style per-client consent.
 */

return [
    // The shared cookie. Domain MUST be `.teezer.live` in prod so every subdomain
    // sends it; left null in local dev (host-only cookie on localhost).
    'cookie_name'   => 'reelsoo_sso',
    'cookie_domain' => env('SSO_COOKIE_DOMAIN'),                 // e.g. .teezer.live
    'cookie_secure' => env('SSO_COOKIE_SECURE', ! env('APP_DEBUG', false)),

    // Session lifetime — mirror the Sanctum token lifetime (30 days) with a
    // sliding window (renewed on use).
    'lifetime_minutes' => (int) env('SSO_LIFETIME_MINUTES', 60 * 24 * 30),

    // Internal first-party clients that can request access to a Reelsoo account.
    'clients' => [
        'ads' => [
            'display_name'    => 'Teezer Ads',
            // Least-privilege abilities minted onto the client's Bearer token.
            'token_abilities' => ['profile', 'email', 'ads.manage'],
            // Human-facing consent rows shown on the authorization screen.
            'scopes' => [
                ['key' => 'profile',    'label' => 'Basic profile'],
                ['key' => 'email',      'label' => 'Email address'],
                ['key' => 'business',   'label' => 'Business account access'],
                ['key' => 'ads.manage', 'label' => 'Advertising account management'],
            ],
        ],
    ],
];
