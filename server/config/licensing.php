<?php

/*
|--------------------------------------------------------------------------
| Teezer Licensing
|--------------------------------------------------------------------------
| Two INDEPENDENT halves live in this file, and keeping them independent is
| the whole point:
|
|   'server' - the licensor side. Only teezer.live runs this. It holds the
|              RSA PRIVATE key and is the only thing that can mint a valid
|              signed licence. Every class behind it lives in
|              App\Licensing\Server and is EXCLUDED from the marketplace
|              package (see scripts/build-marketplace-release.sh), so a
|              customer never receives the code that issues licences.
|
|   'client' - the licensee side. This is what a customer installation runs.
|              It holds only the PUBLIC key and verifies a signed licence
|              LOCALLY. It never calls teezer.live on a request path.
|
| Both default to DISABLED. That is deliberate and load-bearing:
|
|   - client.enabled=false means production teezer.live can never be blocked
|     by its own licence middleware. Turning this on for the licensor would
|     be a self-inflicted outage; the customer .env template is the only
|     place it is ever true.
|   - server.enabled=false means the activation/installation endpoints 404
|     until an operator deliberately switches the licence server on, so the
|     feature cannot go live by accident on a deploy.
*/

return [

    'server' => [
        'enabled' => (bool) env('LICENSE_SERVER_ENABLED', false),

        /*
         | Absolute path to the RSA private key that signs licences.
         |
         | MUST live OUTSIDE the repository (default: /etc/teezer/license-signing-key.pem).
         | It is never committed, never packaged, never copied to a customer VPS,
         | never logged, and never returned by any endpoint. Generate it with
         | `php artisan license:keygen`.
         */
        'private_key_path' => env('LICENSE_SIGNING_PRIVATE_KEY_PATH', '/etc/teezer/license-signing-key.pem'),
        'private_key_passphrase' => env('LICENSE_SIGNING_PRIVATE_KEY_PASSPHRASE'),

        /*
         | How long an issued licence token stays valid before the installation
         | has to refresh it. This is NOT an expiry of the customer's purchase -
         | it is the re-verification window. A perpetual licence simply gets a
         | fresh 90-day token on every successful heartbeat.
         */
        'token_ttl_days' => (int) env('LICENSE_TOKEN_TTL_DAYS', 90),

        /*
         | Disk + prefix holding the private release packages. The bucket stays
         | PRIVATE; customers only ever receive a short-lived presigned URL.
         | They never receive B2 credentials of any kind.
         */
        'release_disk' => env('LICENSE_RELEASE_DISK', 'b2_releases'),
        'release_prefix' => env('LICENSE_RELEASE_PREFIX', 'releases'),
        'release_url_ttl_minutes' => (int) env('LICENSE_RELEASE_URL_TTL_MINUTES', 15),
    ],

    'client' => [
        /*
         | The master switch for licence enforcement on THIS installation.
         |
         | false (default) = no licence is required, no middleware blocks
         | anything, no outbound call is ever made. This is what teezer.live
         | itself runs.
         */
        'enabled' => (bool) env('LICENSING_CLIENT_ENABLED', false),

        /*
         | Where the signed licence lives on the customer's VPS. Written 0600,
         | outside the web root, never served, never rendered, never logged.
         */
        'license_path' => env('LICENSE_FILE_PATH', storage_path('app/license/license.json')),

        /*
         | The PUBLIC verification key. Shipping this is safe by design - it can
         | verify a signature and cannot create one. A customer replacing it with
         | their own key gains nothing unless they also re-sign, which is exactly
         | the property an asymmetric scheme buys.
         */
        'public_key_path' => env('LICENSE_PUBLIC_KEY_PATH', resource_path('licensing/public.pem')),

        /*
         | The domain this installation is licensed for. Normally left blank so
         | APP_URL is used; set explicitly only where APP_URL is not the public
         | hostname. Never read from the request Host header - see
         | LicenseVerifier::configuredDomain().
         */
        'domain' => env('LICENSE_DOMAIN'),

        /*
         | The licence key, used ONLY by the scheduled heartbeat and the update
         | command. It is deliberately NOT kept in the licence file: that file
         | holds the signed token, so a leaked token identifies an installation
         | but cannot renew or re-download anything without this.
         |
         | Read through config (never env() at call time) because this app runs
         | with a cached config in production, where env() outside config/
         | returns null.
         */
        'license_key' => env('LICENSE_KEY'),

        /*
         | The licence server, used ONLY for activation, scheduled heartbeat and
         | updates. Never contacted on a page load, login, API call or feed
         | request. If it is unreachable the installation keeps running.
         */
        'server_url' => env('LICENSE_SERVER_URL', ''),
        'http_timeout' => (int) env('LICENSE_HTTP_TIMEOUT', 15),

        /*
         | Extra days an installation keeps working after its token's expires_at
         | has passed. Covers a licence server outage that spans a whole refresh
         | window without punishing a paying customer for our downtime.
         */
        'grace_days' => (int) env('LICENSE_GRACE_DAYS', 30),

        /*
         | What to do once even the grace window has lapsed:
         |   'warn'  (default) - keep serving, surface a banner to admins.
         |   'block'           - return 503 on API requests.
         |
         | 'warn' is the default on purpose. A stale token means WE could not be
         | reached; that is our failure, not the customer's, and it must never
         | look like data loss. A REVOKED or DOMAIN-MISMATCHED licence is a
         | different case entirely and always blocks, regardless of this setting.
         */
        'stale_policy' => env('LICENSE_STALE_POLICY', 'warn'),

        /*
         | How often the scheduled heartbeat runs. Deliberately coarse: this is a
         | background command, never a request-path call.
         */
        'heartbeat_hours' => (int) env('LICENSE_HEARTBEAT_HOURS', 24),

        /*
         | Cache TTL for the verified licence state. Verification is a local RSA
         | check over a ~400-byte payload, so this is a micro-optimisation rather
         | than a necessity - but it keeps the middleware off the filesystem on
         | every request.
         */
        'state_cache_seconds' => (int) env('LICENSE_STATE_CACHE_SECONDS', 300),
    ],

    /*
     | Product identity carried in the signed payload. A token minted for a
     | different product never validates here.
     */
    'product' => env('LICENSE_PRODUCT', 'teezer'),
];
