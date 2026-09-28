<?php

/**
 * The catalogue of third-party integrations.
 *
 * This file is the ONLY place a provider is declared. Adding one means adding an
 * entry here - the admin UI, the credential storage, the validation and the
 * env fallback are all driven off this array, so no new code is required for a
 * provider that needs nothing more exotic than keys and an endpoint.
 *
 * Which providers exist is deliberately code rather than database rows: a
 * provider list that admins could add arbitrary entries to would let one
 * compromised admin account point an integration anywhere.
 *
 * Field semantics
 * ---------------
 *  secret: true   -> stored in the ENCRYPTED credentials blob, never returned to
 *                    the browser in full (the API sends a masked preview only).
 *  secret: false  -> stored in plaintext `settings`, safe to display and log.
 *  env:           -> the .env key this field falls back to when no database
 *                    value is set. This is what makes the module adoptable
 *                    without a migration of existing configuration: everything
 *                    keeps working from .env until someone saves it in the UI.
 *
 * NOTE the ordering rule that goes with `env`: database value wins, env is the
 * fallback. That way a key rotated in the panel takes effect immediately, while
 * an untouched provider keeps reading the value it has always read.
 */

$text   = fn (string $label, ?string $env = null, bool $secret = false, bool $required = false) => [
    'label' => $label, 'env' => $env, 'secret' => $secret, 'required' => $required, 'type' => 'text',
];
$secret = fn (string $label, ?string $env = null, bool $required = false) => [
    'label' => $label, 'env' => $env, 'secret' => true, 'required' => $required, 'type' => 'password',
];
$url    = fn (string $label, ?string $env = null, bool $required = false) => [
    'label' => $label, 'env' => $env, 'secret' => false, 'required' => $required, 'type' => 'url',
];

return [

    /*
     * Grouping is presentation only - it decides the section headings in
     * Settings > Third-Party Integrations.
     */
    'groups' => [
        'music'         => 'Music & Metadata',
        'storage'       => 'Storage & CDN',
        'communication' => 'Email & Notifications',
        'payments'      => 'Payments',
        'intelligence'  => 'AI & Analytics',
        'platform'      => 'Platform Services',
        'ar'            => 'Camera and AR Effects',
    ],

    'providers' => [

        /* ── Music & metadata ─────────────────────────────────────────── */

        'spotify' => [
            'label'   => 'Spotify',
            'group'   => 'music',
            'docs'    => 'https://developer.spotify.com/documentation/web-api',
            // Enrichment only. Spotify audio is never streamed or stored - see
            // the music system's primary rule: the Teezer catalog is the source
            // of truth and Spotify may only decorate it.
            'notes'   => 'Artist images, album art, genres, popularity, external links. Never used for playback.',
            'auth'    => 'oauth_client_credentials',
            // Spotify's client-credentials tokens last an hour, so this provider
            // is the reason the refresher exists at all.
            'refreshable' => true,
            'test'    => 'token', // Test Connection = mint a token
            'fields'  => [
                'client_id'     => $text('Client ID', 'SPOTIFY_CLIENT_ID', false, true),
                'client_secret' => $secret('Client Secret', 'SPOTIFY_CLIENT_SECRET', true),
                'api_endpoint'  => $url('API Endpoint', 'SPOTIFY_API_URL'),
            ],
            'defaults' => [
                'api_endpoint' => 'https://api.spotify.com/v1',
                'token_url'    => 'https://accounts.spotify.com/api/token',
            ],
        ],

        'musicbrainz' => [
            'label'   => 'MusicBrainz',
            'group'   => 'music',
            'docs'    => 'https://musicbrainz.org/doc/MusicBrainz_API',
            // No key at all - MusicBrainz authenticates nobody and rate-limits
            // by User-Agent, which is why the UA field is required rather than
            // cosmetic. An anonymous or generic UA gets blocked.
            'notes'   => 'Release dates, ISRCs, labels, discography. No API key; a descriptive User-Agent is mandatory.',
            'auth'    => 'none',
            'refreshable' => false,
            'test'    => 'ping',
            'fields'  => [
                'api_endpoint' => $url('API Endpoint', 'MUSICBRAINZ_API_URL'),
                'user_agent'   => $text('User-Agent', 'MUSICBRAINZ_USER_AGENT', false, true),
            ],
            'defaults' => [
                'api_endpoint' => 'https://musicbrainz.org/ws/2',
                'user_agent'   => 'Teezer/1.0 (contact: support@teezer.live)',
                // Their published fair-use ceiling. Encoded here so the client
                // cannot accidentally exceed it.
                'rate_limit_per_second' => 1,
            ],
        ],

        'wikipedia' => [
            'label'   => 'Wikipedia',
            'group'   => 'music',
            'docs'    => 'https://api.wikimedia.org/wiki/Core_REST_API',
            'notes'   => 'Artist and band biographies. Already used by the knowledge cards; same User-Agent policy applies.',
            'auth'    => 'none',
            'refreshable' => false,
            'test'    => 'ping',
            'fields'  => [
                'api_endpoint' => $url('API Endpoint', 'WIKIPEDIA_API_URL'),
                'user_agent'   => $text('User-Agent', 'WIKIPEDIA_USER_AGENT', false, true),
            ],
            'defaults' => [
                'api_endpoint' => 'https://en.wikipedia.org/api/rest_v1',
                'user_agent'   => 'Teezer/1.0 (contact: support@teezer.live)',
            ],
        ],

        'shazamkit' => [
            'label'   => 'ShazamKit',
            'group'   => 'music',
            'docs'    => 'https://developer.apple.com/shazamkit/',
            // Recognition happens ON DEVICE via Apple's framework. There is no
            // server-side Shazam call, so what is stored here is the developer
            // token the app needs, not an API key this backend uses.
            'notes'   => 'iOS-only, on-device recognition during upload. The backend stores the developer token; it never calls Shazam itself.',
            'auth'    => 'developer_token',
            'refreshable' => false,
            'test'    => 'none',
            'fields'  => [
                'developer_token' => $secret('Developer Token', 'SHAZAM_DEVELOPER_TOKEN'),
                'team_id'         => $text('Apple Team ID', 'APPLE_TEAM_ID'),
            ],
        ],

        /* ── Storage & CDN ────────────────────────────────────────────── */

        'backblaze' => [
            'label'   => 'Backblaze B2',
            'group'   => 'storage',
            'notes'   => 'Primary object storage for all media. Live: changing these affects every upload and playback.',
            'auth'    => 'key_pair',
            'refreshable' => false,
            'test'    => 'bucket',
            'fields'  => [
                'key_id'       => $text('Application Key ID', 'B2_APPLICATION_KEY_ID', false, true),
                'app_key'      => $secret('Application Key', 'B2_APPLICATION_KEY', true),
                'bucket'       => $text('Bucket', 'B2_BUCKET', false, true),
                'api_endpoint' => $url('S3 Endpoint', 'B2_ENDPOINT', true),
                'region'       => $text('Region', 'B2_REGION'),
            ],
        ],

        'cloudflare' => [
            'label'   => 'Cloudflare',
            'group'   => 'storage',
            'notes'   => 'DNS, cache rules and the media Worker. Token needs only the zones you intend to manage.',
            'auth'    => 'token',
            'refreshable' => false,
            'test'    => 'token',
            'fields'  => [
                'api_token' => $secret('API Token', 'CLOUDFLARE_API_TOKEN'),
                'zone_id'   => $text('Zone ID', 'CLOUDFLARE_ZONE_ID'),
                'account_id'=> $text('Account ID', 'CLOUDFLARE_ACCOUNT_ID'),
            ],
        ],

        /* ── Email & notifications ────────────────────────────────────── */

        'mail' => [
            'label'   => 'Email Provider (SMTP)',
            'group'   => 'communication',
            'auth'    => 'basic',
            'refreshable' => false,
            'test'    => 'smtp',
            'fields'  => [
                'host'       => $text('SMTP Host', 'MAIL_HOST', false, true),
                'port'       => $text('Port', 'MAIL_PORT'),
                'username'   => $text('Username', 'MAIL_USERNAME'),
                'password'   => $secret('Password', 'MAIL_PASSWORD'),
                'from_address' => $text('From Address', 'MAIL_FROM_ADDRESS'),
            ],
        ],

        'firebase' => [
            'label'   => 'Firebase (Push)',
            'group'   => 'communication',
            'auth'    => 'service_account',
            'refreshable' => false,
            'test'    => 'token',
            'notes'   => 'Paste the full service-account JSON here, not a file path - PushService accepts either.',
            'fields'  => [
                // Env names match config/push.php (FCM_*), not a "FIREBASE_*"
                // guess - PushService::fcmAccessToken() reads push.fcm.*, which
                // is sourced from these two .env keys.
                'project_id'      => $text('Project ID', 'FCM_PROJECT_ID'),
                'service_account' => $secret('Service Account JSON', 'FCM_CREDENTIALS'),
            ],
        ],

        /* ── Payments ─────────────────────────────────────────────────── */

        'paypal' => [
            'label'   => 'PayPal',
            'group'   => 'payments',
            // Money. The test here must stay read-only - never a live charge.
            'notes'   => 'Live payments. Test Connection only mints a token; it never creates an order.',
            'auth'    => 'oauth_client_credentials',
            'refreshable' => true,
            'test'    => 'token',
            'fields'  => [
                'client_id'     => $text('Client ID', 'PAYPAL_CLIENT_ID', false, true),
                'client_secret' => $secret('Client Secret', 'PAYPAL_SECRET', true),
                'webhook_secret'=> $secret('Webhook ID', 'PAYPAL_WEBHOOK_ID'),
                'api_endpoint'  => $url('API Endpoint', 'PAYPAL_API_URL'),
                'callback_url'  => $url('Callback URL', 'PAYPAL_RETURN_URL'),
            ],
        ],

        'stripe' => [
            'label'   => 'Stripe',
            'group'   => 'payments',
            'notes'   => 'Live payments. Test Connection performs a read-only account fetch.',
            'auth'    => 'key',
            'refreshable' => false,
            'test'    => 'account',
            'fields'  => [
                'publishable_key' => $text('Publishable Key', 'STRIPE_KEY'),
                'api_key'         => $secret('Secret Key', 'STRIPE_SECRET'),
                'webhook_secret'  => $secret('Webhook Signing Secret', 'STRIPE_WEBHOOK_SECRET'),
            ],
        ],

        /* ── AI & analytics ───────────────────────────────────────────── */

        'sightengine' => [
            'label'   => 'Sightengine (Moderation)',
            'group'   => 'intelligence',
            'auth'    => 'key_pair',
            'refreshable' => false,
            'test'    => 'ping',
            'fields'  => [
                'api_user'   => $text('API User', 'SIGHTENGINE_USER'),
                'api_secret' => $secret('API Secret', 'SIGHTENGINE_SECRET'),
            ],
        ],

        'clickhouse' => [
            'label'   => 'ClickHouse (Analytics)',
            'group'   => 'intelligence',
            'auth'    => 'basic',
            'refreshable' => false,
            'test'    => 'ping',
            'fields'  => [
                'dsn' => $secret('DSN', 'CLICKHOUSE_DSN'),
            ],
        ],

        /* ── Platform services ────────────────────────────────────────── */

        'turnstile' => [
            'label'   => 'Cloudflare Turnstile',
            'group'   => 'platform',
            'auth'    => 'key_pair',
            'refreshable' => false,
            'test'    => 'none',
            'fields'  => [
                'site_key'   => $text('Site Key', 'TURNSTILE_SITE_KEY'),
                'api_secret' => $secret('Secret Key', 'TURNSTILE_SECRET_KEY'),
            ],
        ],

        'nominatim' => [
            'label'   => 'Nominatim (Maps)',
            'group'   => 'platform',
            'auth'    => 'none',
            'refreshable' => false,
            'test'    => 'ping',
            'fields'  => [
                'api_endpoint' => $url('API Endpoint', 'NOMINATIM_BASE_URL'),
                'user_agent'   => $text('User-Agent', 'NOMINATIM_USER_AGENT'),
            ],
            'defaults' => [
                'api_endpoint' => 'https://nominatim.openstreetmap.org',
            ],
        ],

        'livekit' => [
            'label'   => 'LiveKit (Live Spaces)',
            'group'   => 'platform',
            'auth'    => 'key_pair',
            'refreshable' => false,
            'test'    => 'token',
            'fields'  => [
                'api_key'      => $text('API Key', 'LIVEKIT_API_KEY'),
                'api_secret'   => $secret('API Secret', 'LIVEKIT_API_SECRET'),
                'api_endpoint' => $url('WS URL', 'LIVEKIT_URL'),
            ],
        ],

        'centrifugo' => [
            'label'   => 'Centrifugo (Realtime)',
            'group'   => 'platform',
            'auth'    => 'key_pair',
            'refreshable' => false,
            'test'    => 'ping',
            'fields'  => [
                'api_key'      => $secret('API Key', 'CENTRIFUGO_API_KEY'),
                'token_secret' => $secret('Token HMAC Secret', 'CENTRIFUGO_TOKEN_SECRET'),
                'api_endpoint' => $url('API URL', 'CENTRIFUGO_API_URL'),
            ],
        ],

        /* ── Video CDN & streaming ────────────────────────────────────── */

        'bunnycdn' => [
            'label'   => 'Bunny.net (CDN & Stream)',
            'group'   => 'storage',
            'notes'   => 'Account API key lists your libraries. The storage password is per-zone; the Stream key is per video library.',
            'auth'    => 'token',
            'refreshable' => false,
            'test'    => 'bunnycdn',
            'fields'  => [
                'api_key'           => $secret('Account API Key', 'BUNNYCDN_API_KEY'),
                'storage_zone'      => $text('Storage Zone Name', 'BUNNYCDN_STORAGE_ZONE'),
                'storage_password'  => $secret('Storage Zone Password', 'BUNNYCDN_STORAGE_PASSWORD'),
                'storage_region'    => $text('Storage Region', 'BUNNYCDN_STORAGE_REGION'),
                'pull_zone_url'     => $url('Pull Zone URL', 'BUNNYCDN_PULL_ZONE_URL'),
                'stream_library_id' => $text('Stream Library ID', 'BUNNYCDN_STREAM_LIBRARY_ID'),
                'stream_api_key'    => $secret('Stream API Key', 'BUNNYCDN_STREAM_API_KEY'),
            ],
        ],

        'cloudflare_stream' => [
            'label'   => 'Cloudflare Stream',
            'group'   => 'storage',
            'notes'   => 'Separate from the Cloudflare entry above: this token needs Stream:Edit on the account, not zone permissions.',
            'auth'    => 'token',
            'refreshable' => false,
            'test'    => 'cloudflare_stream',
            'fields'  => [
                'account_id'         => $text('Account ID', 'CLOUDFLARE_STREAM_ACCOUNT_ID'),
                'api_token'          => $secret('Stream API Token', 'CLOUDFLARE_STREAM_API_TOKEN'),
                'customer_subdomain' => $text('Customer Subdomain', 'CLOUDFLARE_STREAM_SUBDOMAIN'),
                'signing_key_id'     => $text('Signing Key ID', 'CLOUDFLARE_STREAM_SIGNING_KEY_ID'),
                'signing_key_pem'    => $secret('Signing Key (JWK or PEM)', 'CLOUDFLARE_STREAM_SIGNING_KEY'),
            ],
        ],

        /* ── Content-safety classifiers ───────────────────────────────── */

        'aws_rekognition' => [
            'label'   => 'AWS Rekognition (NSFW)',
            'group'   => 'intelligence',
            'notes'   => 'Needs rekognition:DetectModerationLabels. The test calls it on a generated 1x1 image, which costs one request.',
            'auth'    => 'key_pair',
            'refreshable' => false,
            'test'    => 'aws_rekognition',
            'fields'  => [
                'access_key_id'     => $text('Access Key ID', 'AWS_REKOGNITION_KEY_ID'),
                'secret_access_key' => $secret('Secret Access Key', 'AWS_REKOGNITION_SECRET'),
                'region'            => $text('Region', 'AWS_REKOGNITION_REGION'),
                'min_confidence'    => $text('Min Confidence %', 'AWS_REKOGNITION_MIN_CONFIDENCE'),
            ],
        ],

        'google_vision' => [
            'label'   => 'Google Cloud Vision (NSFW)',
            'group'   => 'intelligence',
            'notes'   => 'SafeSearch detection. An API key is simplest; the test sends a generated 1x1 image.',
            'auth'    => 'token',
            'refreshable' => false,
            'test'    => 'google_vision',
            'fields'  => [
                'api_key'      => $secret('API Key', 'GOOGLE_VISION_API_KEY'),
                'api_endpoint' => $url('API Endpoint', 'GOOGLE_VISION_ENDPOINT'),
            ],
        ],

        /* ── Realtime video ───────────────────────────────────────────── */

        'agora' => [
            'label'   => 'Agora (RTC)',
            'group'   => 'platform',
            'notes'   => 'App ID and certificate mint client tokens. Customer ID/Secret are the REST credentials, and are what the test uses.',
            'auth'    => 'key_pair',
            'refreshable' => false,
            'test'    => 'agora',
            'fields'  => [
                'app_id'          => $text('App ID', 'AGORA_APP_ID'),
                'app_certificate' => $secret('App Certificate', 'AGORA_APP_CERTIFICATE'),
                'customer_id'     => $text('Customer ID (REST)', 'AGORA_CUSTOMER_ID'),
                'customer_secret' => $secret('Customer Secret (REST)', 'AGORA_CUSTOMER_SECRET'),
            ],
        ],

        /* ── Camera & AR effects ──────────────────────────────────────────
           These are CLIENT-side SDKs. The licence is validated in the browser
           or on the device against the vendor's own servers, never by us, so
           `test` is 'none' rather than a check that would always pass and mean
           nothing. The keys live here so the web and mobile clients read them
           from the same place as every other credential. */

        'deepar' => [
            'label'   => 'DeepAR (Face Filters)',
            'group'   => 'ar',
            'notes'   => 'Licence keys are per platform and bound to your bundle id or domain. Validated in-client by DeepAR, so there is no server-side test.',
            'auth'    => 'token',
            'refreshable' => false,
            'test'    => 'none',
            'fields'  => [
                'license_key_web'     => $secret('Web Licence Key', 'DEEPAR_LICENSE_KEY_WEB'),
                'license_key_android' => $secret('Android Licence Key', 'DEEPAR_LICENSE_KEY_ANDROID'),
                'license_key_ios'     => $secret('iOS Licence Key', 'DEEPAR_LICENSE_KEY_IOS'),
            ],
        ],

        'banuba' => [
            'label'   => 'Banuba (Face AR)',
            'group'   => 'ar',
            'notes'   => 'Client token issued by Banuba and tied to your app. Validated in-client, so there is no server-side test.',
            'auth'    => 'token',
            'refreshable' => false,
            'test'    => 'none',
            'fields'  => [
                'client_token' => $secret('Client Token', 'BANUBA_CLIENT_TOKEN'),
            ],
        ],

        'snap_camera_kit' => [
            'label'   => 'Snap Camera Kit',
            'group'   => 'ar',
            'notes'   => 'API token plus the lens group to load. Validated in-client by Camera Kit, so there is no server-side test.',
            'auth'    => 'token',
            'refreshable' => false,
            'test'    => 'none',
            'fields'  => [
                'api_token'     => $secret('API Token', 'SNAP_CAMERA_KIT_API_TOKEN'),
                'lens_group_id' => $text('Lens Group ID', 'SNAP_CAMERA_KIT_LENS_GROUP'),
                'staging_token' => $secret('Staging API Token', 'SNAP_CAMERA_KIT_STAGING_TOKEN'),
            ],
        ],
    ],
];
