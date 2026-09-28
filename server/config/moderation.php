<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Moderation enabled
    |--------------------------------------------------------------------------
    | When false, all uploads are auto-approved and no scanner is called.
    | Override per environment via MODERATION_ENABLED in .env.
    */
    'enabled' => env('MODERATION_ENABLED', false),

    /*
    |--------------------------------------------------------------------------
    | Image MIME types (non-video uploads route to image check)
    |--------------------------------------------------------------------------
    */
    'image_mimes' => ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'],

    /*
    |--------------------------------------------------------------------------
    | Presigned download URL TTL (minutes)
    |--------------------------------------------------------------------------
    | Must be long enough for Sightengine to download large video files before
    | the URL expires.
    */
    'presign_ttl_minutes' => (int) env('MODERATION_PRESIGN_TTL', 60),

    /*
    |--------------------------------------------------------------------------
    | Python scanner microservice (ModerationService::callScanner())
    |--------------------------------------------------------------------------
    | Was referenced via config('moderation.scanner_url'/'scanner_key'/
    | 'scanner_timeout') with no matching entries here, so SCANNER_API_KEY had
    | no way to reach the request - the scanner's own auth check received an
    | empty key from every caller and (being written to no-op when its own
    | API_KEY env is unset) only enforced anything if someone happened to set
    | SCANNER_API_KEY on the scanner host, otherwise skipped auth entirely
    | either way. Both sides must now set matching SCANNER_API_KEY values.
    */
    'scanner_url'     => env('SCANNER_URL', 'http://127.0.0.1:7891'),
    'scanner_key'     => env('SCANNER_API_KEY', ''),
    'scanner_timeout' => (int) env('SCANNER_TIMEOUT', 300),

    /*
    |--------------------------------------------------------------------------
    | Sightengine content moderation
    |--------------------------------------------------------------------------
    | Credentials are never exposed to the frontend. The admin panel can
    | override these values via AppSetting DB keys at runtime.
    |
    | Models:   nudity-2.1, weapon, recreational_drug, gore, offensive
    |           (comma-separated, must match your Sightengine plan)
    |
    | Thresholds:
    |   block_threshold  - score >= this → upload rejected (status: failed)
    |   review_threshold - score >= this → flagged for manual review
    */
    'sightengine_enabled'           => env('SIGHTENGINE_ENABLED', false),
    'sightengine_api_user'          => env('SIGHTENGINE_API_USER', ''),
    'sightengine_api_secret'        => env('SIGHTENGINE_API_SECRET', ''),
    'sightengine_models'            => env('SIGHTENGINE_MODELS', 'nudity-2.1'),
    'sightengine_block_threshold'   => (float) env('SIGHTENGINE_BLOCK_THRESHOLD', 0.80),
    'sightengine_review_threshold'  => (float) env('SIGHTENGINE_REVIEW_THRESHOLD', 0.50),
];
