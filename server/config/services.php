<?php

return [
    /*
    |--------------------------------------------------------------------------
    | GeoIP / IP-to-country
    |--------------------------------------------------------------------------
    | Optional MMDB file used by App\Services\IpCountryService for ASN/ISP
    | enrichment. If the file is missing the service silently falls back to
    | Cloudflare's CF-IPCountry header (always present behind CF proxy), then
    | to NP (Nepal) as the final default. No outbound calls are ever made.
    |
    | To enable, download IPinfo Lite (or another free MMDB) and set:
    |   GEOIP_MMDB_PATH=/var/www/teezer/server/storage/app/geoip/ipinfo-lite.mmdb
    */
    'geoip' => [
        'mmdb_path' => env('GEOIP_MMDB_PATH'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Nominatim (OpenStreetMap reverse geocoding + search)
    |--------------------------------------------------------------------------
    | Default: Nominatim public instance.
    | For production traffic swap to a self-hosted instance:
    |   NOMINATIM_BASE_URL=https://nominatim.yourdomain.com
    */
    /*
    |--------------------------------------------------------------------------
    | Media CDN signing
    |--------------------------------------------------------------------------
    | Shared secret between Laravel and the Cloudflare Worker that guards
    | cdn.teezer.live. The Worker validates the HMAC-SHA256 token on every
    | request under a protected prefix (/videos/, /documents/,
    | /country-residency/, /chat/). Generate with: openssl rand -hex 32
    |
    | This is the CDN signature and has nothing to do with the bucket's own
    | credentials - it stays exactly the same across a storage provider change.
    */
    'media' => [
        'signing_secret' => env('MEDIA_SIGNING_SECRET'),

        // Whether public media URLs carry an HMAC token for an edge worker to
        // validate. Turn OFF once the bucket is served publicly through the CDN
        // with no worker in front: with nothing at the edge checking the token,
        // appending one only fragments the cache and invites confusion about
        // whether the media is actually protected. Private media is unaffected
        // - it is presigned against a private bucket either way.
        'signed_urls' => env('MEDIA_SIGNED_URLS', true),

        // Apex domains of the SOURCE platform whose absolute media URLs may still
        // sit in rows restored from its database (comma-separated, e.g. set to
        // the source apex domain). Such URLs are reduced to an object key and
        // re-served through our own MEDIA_URL. Empty = no legacy host.
        'legacy_domains' => array_values(array_filter(array_map('trim', explode(',', strtolower((string) env('MEDIA_LEGACY_DOMAINS', '')))))),
    ],

    /*
    |--------------------------------------------------------------------------
    | Internal API secret
    |--------------------------------------------------------------------------
    | Shared secret between the Cloudflare Queue consumer Worker and the VPS.
    | The Worker sends this in X-Internal-Secret on every /internal/* call.
    | Generate with: openssl rand -hex 32
    */
    'internal' => [
        'secret' => env('INTERNAL_API_SECRET'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Centrifugo realtime engine
    |--------------------------------------------------------------------------
    | api_url/api_key target Centrifugo's server publish API. token_secret is the
    | HMAC key shared with Centrifugo (its token_hmac_secret_key) used to mint the
    | client connection + subscription JWTs issued by /realtime/token & /subscribe.
    | Generate secrets with: openssl rand -hex 32
    */
    'centrifugo' => [
        'api_url'      => env('CENTRIFUGO_API_URL', 'http://127.0.0.1:8000'),
        'api_key'      => env('CENTRIFUGO_API_KEY'),
        'token_secret' => env('CENTRIFUGO_TOKEN_SECRET'),
        'token_ttl'    => (int) env('CENTRIFUGO_TOKEN_TTL', 3600),
    ],

    'nominatim' => [
        'base_url' => env('NOMINATIM_BASE_URL', 'https://nominatim.openstreetmap.org'),

        /*
         | Nominatim's usage policy REQUIRES a descriptive User-Agent naming the
         | application and a contact; requests with a generic or absent one are
         | blocked outright. LocationService hardcoded this string, which meant
         | the admin panel's user_agent field for the provider did nothing.
         |
         | Null here rather than a literal default: LocationService keeps
         | building the same 'Teezer/1.0 (app.url)' value when this is unset,
         | so nothing changes until someone deliberately overrides it.
         */
        'user_agent' => env('NOMINATIM_USER_AGENT'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Meilisearch - self-hosted full-text search
    |--------------------------------------------------------------------------
    | MEILISEARCH_HOST: URL of your Meilisearch instance (default port 7700).
    | MEILISEARCH_KEY:  Master / admin key - never expose to the frontend.
    |                   The frontend calls the Laravel API proxy instead.
    */
    'meilisearch' => [
        'host' => env('MEILISEARCH_HOST', 'http://127.0.0.1:7700'),
        'key'  => env('MEILISEARCH_KEY'),
    ],

    // Typesense - full-text search engine (replaces Meilisearch). host is the
    // bare hostname (no scheme); protocol/port are separate. See SearchService.
    'typesense' => [
        'host'     => env('TYPESENSE_HOST', '127.0.0.1'),
        'port'     => env('TYPESENSE_PORT', '8108'),
        'protocol' => env('TYPESENSE_PROTOCOL', 'http'),
        'key'      => env('TYPESENSE_API_KEY'),
    ],

    /*
    |--------------------------------------------------------------------------
    | PayPal - Coin purchase payments
    |--------------------------------------------------------------------------
    | mode: sandbox (testing) or live (production).
    | Get credentials at https://developer.paypal.com → My Apps & Credentials.
    */
    'paypal' => [
        'mode'          => env('PAYPAL_MODE', 'sandbox'),
        'client_id'     => env('PAYPAL_CLIENT_ID', ''),
        'client_secret' => env('PAYPAL_CLIENT_SECRET', ''),
    ],

    'upload' => [
        'max_video_mb' => env('MAX_VIDEO_UPLOAD_SIZE_MB', 500),
        'max_image_mb' => env('MAX_IMAGE_UPLOAD_SIZE_MB', 20),
    ],

    // Cloudflare Turnstile - bot protection on the login form. Verification is
    // active only when the secret key is set; otherwise it's a no-op.
    'turnstile' => [
        'secret' => env('TURNSTILE_SECRET_KEY', ''),
    ],

    // Social sign-in (mobile). Accepted audiences when verifying provider tokens.
    'google' => [
        // Comma-separated OAuth client IDs (web + iOS + android) allowed as the
        // token `aud`. Leave empty to accept any (NOT recommended for prod).
        'client_ids' => array_values(array_filter(array_map('trim', explode(',', (string) env('GOOGLE_CLIENT_IDS', ''))))),
    ],
    'apple' => [
        // Accepted `aud` values = your app bundle id(s) / Services ID.
        'bundle_ids' => array_values(array_filter(array_map('trim', explode(',', (string) env('APPLE_BUNDLE_IDS', 'com.teezer.app'))))),
    ],

    // Cloudflare Realtime (serverless SFU / "Calls") - powers live audio rooms
    // and, later, video live streaming. App ID is a non-secret identifier; the
    // API token is server-only (never sent to clients). Values live in .env on
    // the server, out of git. Feature is inert until both are set.
    'cloudflare_realtime' => [
        'app_id'    => env('CF_REALTIME_APP_ID', ''),
        'api_token' => env('CF_REALTIME_API_TOKEN', ''),
        'base_url'  => env('CF_REALTIME_BASE_URL', 'https://rtc.live.cloudflare.com/v1'),
    ],

    // Cloudflare zone-level cache purge (CloudflarePurgeService) - lets a
    // public->private video transition clear its edge-cached /public/... URLs
    // immediately instead of waiting out their Cache-Control TTL. Same env var
    // names the admin Integrations settings UI already declares for a
    // "Cloudflare" entry (config/integrations.php) that was never wired to a
    // real API call - this is that wiring. Feature is inert until both
    // api_token (Zone -> Cache Purge permission) and zone_id are set.
    'cloudflare' => [
        'api_token' => env('CLOUDFLARE_API_TOKEN', ''),
        'zone_id'   => env('CLOUDFLARE_ZONE_ID', ''),
        'account_id'=> env('CLOUDFLARE_ACCOUNT_ID', ''), // unused by purge; kept for parity with the admin UI field
    ],

    /*
    |--------------------------------------------------------------------------
    | StreamHub / LiveKit - self-hosted media engine
    |--------------------------------------------------------------------------
    | StreamHub (App\StreamHub\*) is our own orchestration layer around a
    | self-hosted LiveKit cluster - no cloud/managed SFU involved. host is the
    | LiveKit server's internal Twirp/RTC endpoint (loopback or VPS-internal,
    | never public); api_key/api_secret sign both room-service Twirp calls and
    | participant JWTs, and must never reach a client. LiveKit signs its own
    | webhooks with this SAME key/secret pair (Agence104\LiveKit\
    | WebhookReceiver verifies against it directly) - there is no separate
    | webhook secret to configure.
    |
    | Recording destination is deliberately NOT the app's default filesystem
    | disk - Egress uploads the FINAL recording directly to whatever
    | S3-compatible bucket/prefix is configured here (defaults to the existing
    | B2 bucket under a separate prefix; the access key/secret used are read
    | from that disk's OWN config - filesystems.disks.{recording_disk} - not
    | duplicated here). App\StreamHub\LiveKitWebhookController reuses the
    | existing MediaPresignService to sign playback URLs at read time. Live
    | media itself never touches this app or B2 while a room is active.
    |
    | Feature is inert until host/api_key/api_secret are all set.
    */
    'livekit' => [
        'host'              => env('LIVEKIT_HOST', ''),
        'api_key'           => env('LIVEKIT_API_KEY', ''),
        'api_secret'        => env('LIVEKIT_API_SECRET', ''),
        'recording_disk'    => env('LIVEKIT_RECORDING_DISK', 'b2'),
        'recording_bucket'  => env('LIVEKIT_RECORDING_BUCKET', env('B2_BUCKET', '')),
        'recording_prefix'  => env('LIVEKIT_RECORDING_PREFIX', 'recordings/spaces'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Profile-view notification cooldown
    |--------------------------------------------------------------------------
    | Repeat visits to the same profile from the same viewer only send one
    | "X viewed your profile" notification per this many days - see
    | App\Http\Controllers\Api\UserController::recordProfileView().
    */
    'profile_view_notifications' => [
        'cooldown_days' => (int) env('PROFILE_VIEW_NOTIFICATION_COOLDOWN_DAYS', 7),
    ],

    /*
    |--------------------------------------------------------------------------
    | ClickHouse - analytics / event store
    |--------------------------------------------------------------------------
    | Runs on VPS-2, bound to loopback. VPS-1 reaches it through an SSH tunnel
    | (teezer-clickhouse-tunnel.service), because port 22 is the only port open
    | between the two boxes - hence the 127.0.0.1 default: the tunnel terminates
    | locally. Never point this at VPS-2's public IP; there is nothing listening.
    |
    | An empty CLICKHOUSE_URL disables ClickHouse-backed analytics and Studio
    | falls back to its Postgres queries. That is the kill switch.
    */
    'clickhouse' => [
        'url'      => env('CLICKHOUSE_URL', 'http://127.0.0.1:8123'),
        'username' => env('CLICKHOUSE_USER', 'teezer'),
        'password' => env('CLICKHOUSE_PASSWORD', ''),
        'database' => env('CLICKHOUSE_DATABASE', 'teezer'),
        'timeout'  => (int) env('CLICKHOUSE_TIMEOUT', 15),
    ],

    /*
    |--------------------------------------------------------------------------
    | api.video - external transcoding provider
    |--------------------------------------------------------------------------
    | APIVIDEO_ENABLED is the kill switch for the whole provider-orchestrated
    | pipeline (StartTranscodingJob / TransferEncodedOutputToB2 / the webhook
    | route). false (the default) leaves every existing video and the local-
    | ffmpeg TranscodeVideoToHls pipeline completely unaffected - see
    | VideoService::createFromUpload() for the one place this flag is read.
    |
    | api.video has no documented S3/B2-branded ingestion or export (verified
    | against their live docs, not assumed) - encoded output is pulled back to
    | B2 by TransferEncodedOutputToB2 rather than delivered there directly.
    */
    'apivideo' => [
        'enabled'        => (bool) env('APIVIDEO_ENABLED', false),
        'api_key'        => env('APIVIDEO_API_KEY', ''),
        'webhook_secret' => env('APIVIDEO_WEBHOOK_SECRET', ''),
    ],

    /*
    |--------------------------------------------------------------------------
    | countries.dev
    |--------------------------------------------------------------------------
    | Optional country-data/geolocation provider (free, keyless, no
    | documented rate limit - https://countries.dev). false (the default)
    | leaves the app fully functional: IpCountryService's existing CF-header
    | -> MMDB -> hardcoded-default cascade is unaffected, and CountryData
    | Service reads only the local country_metadata table either way - see
    | CountriesDevGateway's docblock for the full rate-limit-safety design
    | (cache, single-flight, circuit breaker, concurrency guard) that sits
    | between this app and the provider.
    */
    'countriesdev' => [
        'enabled'                   => (bool) env('COUNTRIES_DEV_ENABLED', false),
        'base_url'                  => env('COUNTRIES_DEV_BASE_URL', 'https://countries.dev'),
        'timeout'                   => (int) env('COUNTRIES_DEV_TIMEOUT', 5),
        'max_concurrency'           => (int) env('COUNTRIES_DEV_MAX_CONCURRENT_REQUESTS', 5),
        'retry_limit'               => (int) env('COUNTRIES_DEV_RETRY_LIMIT', 2),
        'cache_ttl'                 => (int) env('COUNTRIES_DEV_CACHE_TTL', 604800),
        'geo_cache_ttl'             => (int) env('COUNTRIES_DEV_GEO_CACHE_TTL', 3600),
        'circuit_breaker_threshold' => (int) env('COUNTRIES_DEV_CIRCUIT_BREAKER_THRESHOLD', 5),
        'circuit_breaker_cooldown'  => (int) env('COUNTRIES_DEV_CIRCUIT_BREAKER_COOLDOWN', 60),
    ],

];
