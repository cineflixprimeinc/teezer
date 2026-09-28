<?php

$allowedOrigins = array_filter(array_map(
    'trim',
    explode(',', env('CORS_ORIGIN', 'http://localhost:3000,http://localhost:3001'))
));

return [
    /*
     * Empty deliberately. Every path this used to cover ('api/*' and
     * 'sanctum/csrf-cookie') is reached through api.teezer.live, which as of
     * the APISIX gateway now proxies 100% of its traffic through APISIX
     * first (deploy/apisix/routes/*.json - the catchall route explicitly
     * includes /sanctum/csrf-cookie). CORS enforcement for all of it moved
     * to APISIX's cors plugin (same allow-list, mirrored via
     * APISIX_CORS_ORIGINS in deploy/apisix/.env). Leaving any path here too
     * would add a second Access-Control-Allow-Origin header on the same
     * response, which some browsers reject outright as an invalid preflight.
     */
    'paths' => [],

    'allowed_methods' => ['*'],

    /*
     * In production, CORS_ORIGIN in .env controls the allowed list:
     *   CORS_ORIGIN=https://teezer.live,https://www.teezer.live,https://backend.teezer.live
     *
     * For local dev the default allows localhost:3000 (web) and localhost:3001 (admin).
     */
    'allowed_origins' => $allowedOrigins,

    /*
     * First-party subdomains (teezer.live and *.teezer.live over https) are always
     * allowed so new surfaces like ads.teezer.live work without an env change. Bearer
     * token auth is used (not cookies), so this widening carries no credential risk.
     */
    'allowed_origins_patterns' => [
        '#^https://([a-z0-9-]+\.)?teezer\.live$#i',
    ],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 86400,

    'supports_credentials' => (bool) env('CORS_SUPPORTS_CREDENTIALS', false),
];
