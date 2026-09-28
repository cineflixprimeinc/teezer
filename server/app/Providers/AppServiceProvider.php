<?php

namespace App\Providers;

use App\Filesystem\SignedFilesystemAdapter;
use Illuminate\Support\Facades\Storage;
use App\Models\AudioTrack;
use App\Models\Hashtag;
use App\Models\User;
use App\Models\Video;
use App\Models\VideoLike;
use App\Models\VideoView;
use App\Observers\AudioTrackObserver;
use App\Observers\HashtagObserver;
use App\Observers\UserSearchObserver;
use App\Observers\VideoLikeObserver;
use App\Observers\VideoObserver;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Connection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Routing\UrlGenerator;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(\App\Services\StorageService::class);
        $this->app->singleton(\App\Services\VideoService::class);
        $this->app->singleton(\App\Services\FeedService::class);
        $this->app->singleton(\App\Services\NotificationService::class);
        $this->app->singleton(\App\Services\AnalyticsService::class);
        $this->app->singleton(\App\Services\WalletService::class);
        $this->app->singleton(\App\Services\SearchService::class);
        $this->app->singleton(\App\Services\TextModerationService::class);

        // ClickHouse is read-only from PHP (the Go backend owns writes), so one
        // shared client is all we need. Config lives in services.clickhouse.
        $this->app->singleton(\App\Services\ClickHouse\ClickHouseClient::class, function () {
            $cfg = config('services.clickhouse');

            return new \App\Services\ClickHouse\ClickHouseClient(
                url:      $cfg['url'],
                username: $cfg['username'],
                password: $cfg['password'],
                database: $cfg['database'],
                timeout:  $cfg['timeout'],
            );
        });

        $this->app->singleton(\App\Services\Studio\StudioAnalyticsQueries::class);

        // ── Ads System ──────────────────────────────────────────────────────
        // The predictor is swappable (heuristic now, trained model later) behind
        // this interface; the ad server + frequency cap resolve their config here.
        $this->app->bind(\App\Services\Ads\Contracts\AdPredictor::class, \App\Services\Ads\HeuristicAdPredictor::class);
        $this->app->singleton(\App\Services\Ads\FrequencyCap::class, fn () => new \App\Services\Ads\FrequencyCap(
            (int) config('ads.frequency_cap.per_session', 3),
            (int) config('ads.frequency_cap.per_day', 8),
        ));
        $this->app->singleton(\App\Services\Ads\AdServer::class);

        // ── Video transcoding provider ──────────────────────────────────────
        // Swappable the same way AdPredictor is above: everything outside
        // app/Services/Video and app/Jobs/Video depends on the interface, so
        // adding another provider later means a new class here, not touching
        // the jobs, webhook controller, or anything upload/playback-related.
        $this->app->singleton(\App\Services\Video\Providers\ApiVideoProvider::class, fn () =>
            new \App\Services\Video\Providers\ApiVideoProvider(
                apiKey: (string) config('services.apivideo.api_key'),
                webhookSecret: (string) config('services.apivideo.webhook_secret'),
            )
        );
        $this->app->bind(\App\Services\Video\Contracts\TranscodingProvider::class, \App\Services\Video\Providers\ApiVideoProvider::class);
        $this->app->singleton(\App\Services\Video\VideoProcessingService::class);

        // ── countries.dev provider (optional, off by default) ──────────────
        // Swappable the same way as the video provider above: everything
        // outside app/Services/CountriesDev depends on CountriesDevGateway
        // (or the CountryDataProvider interface), never CountriesDevProvider
        // directly - adding another provider later means a new class here.
        $this->app->singleton(\App\Services\CountriesDev\Providers\CountriesDevProvider::class, fn () =>
            new \App\Services\CountriesDev\Providers\CountriesDevProvider(
                baseUrl: (string) config('services.countriesdev.base_url'),
                timeout: (int) config('services.countriesdev.timeout'),
                retryLimit: (int) config('services.countriesdev.retry_limit'),
            )
        );
        $this->app->bind(\App\Services\CountriesDev\Contracts\CountryDataProvider::class, \App\Services\CountriesDev\Providers\CountriesDevProvider::class);
        $this->app->singleton(\App\Services\CountriesDev\Support\CountriesDevCircuitBreaker::class, fn () =>
            new \App\Services\CountriesDev\Support\CountriesDevCircuitBreaker(
                threshold: (int) config('services.countriesdev.circuit_breaker_threshold'),
                cooldownSeconds: (int) config('services.countriesdev.circuit_breaker_cooldown'),
            )
        );
        $this->app->singleton(\App\Services\CountriesDev\CountriesDevGateway::class, fn ($app) =>
            new \App\Services\CountriesDev\CountriesDevGateway(
                provider: $app->make(\App\Services\CountriesDev\Contracts\CountryDataProvider::class),
                breaker: $app->make(\App\Services\CountriesDev\Support\CountriesDevCircuitBreaker::class),
                enabled: (bool) config('services.countriesdev.enabled'),
                geoCacheTtl: (int) config('services.countriesdev.geo_cache_ttl'),
                metaCacheTtl: (int) config('services.countriesdev.cache_ttl'),
                maxConcurrency: (int) config('services.countriesdev.max_concurrency'),
                requestTimeout: (int) config('services.countriesdev.timeout'),
            )
        );


        /*
         * ── Moderation provider chain ───────────────────────────────────────
         *
         * Registered but NOT yet wired into the upload pipeline. ModerationService
         * still calls the Python scanner exactly as before, so this changes no
         * production behaviour today - it is the seam that lets the pipeline gain
         * fallback providers in a separate, testable step.
         *
         * Order here is the DEFAULT only; an admin reorders via the
         * moderation_provider_priority setting. Sightengine is the first adapter
         * because it was already configurable and credentialed yet never called -
         * the largest gap between what the panel promised and what ran.
         */
        $this->app->singleton(\App\Services\Moderation\ModerationChain::class, fn ($app) =>
            new \App\Services\Moderation\ModerationChain([
                $app->make(\App\Services\Moderation\Providers\SightengineModerationProvider::class),
            ])
        );

        // ── Licensing ───────────────────────────────────────────────────────
        // Two halves that must never be confused. The CLIENT half (store,
        // verifier) runs on every installation including this one, and does
        // nothing at all while licensing.client.enabled is false - which is how
        // teezer.live is configured, so production can never block itself on
        // its own licence check.
        //
        // The SERVER half (signer, issuer, key factory, release authorizer) is
        // the licensor side. It is bound here so the licence-server endpoints
        // can resolve it, and the whole App\Licensing\Server namespace is
        // EXCLUDED from the marketplace package - a customer never receives the
        // code that mints a licence, and could not use it if they did without
        // the private key, which never leaves this server.
        $this->app->singleton(\App\Licensing\Client\LicenseStore::class, fn () =>
            new \App\Licensing\Client\LicenseStore(
                (string) config('licensing.client.license_path'),
            )
        );
        $this->app->singleton(\App\Licensing\Client\LicenseVerifier::class, fn ($app) =>
            new \App\Licensing\Client\LicenseVerifier(
                store:         $app->make(\App\Licensing\Client\LicenseStore::class),
                publicKeyPath: (string) config('licensing.client.public_key_path'),
                product:       (string) config('licensing.product'),
                graceDays:     (int) config('licensing.client.grace_days'),
                cacheSeconds:  (int) config('licensing.client.state_cache_seconds'),
                enabled:       (bool) config('licensing.client.enabled'),
            )
        );
        $this->app->singleton(\App\Licensing\Server\LicenseKeyFactory::class);
        $this->app->singleton(\App\Licensing\Server\LicenseSigner::class, fn () =>
            new \App\Licensing\Server\LicenseSigner(
                privateKeyPath: (string) config('licensing.server.private_key_path'),
                passphrase:     config('licensing.server.private_key_passphrase'),
            )
        );
        $this->app->singleton(\App\Licensing\Server\LicenseIssuer::class, fn ($app) =>
            new \App\Licensing\Server\LicenseIssuer(
                keys:         $app->make(\App\Licensing\Server\LicenseKeyFactory::class),
                signer:       $app->make(\App\Licensing\Server\LicenseSigner::class),
                tokenTtlDays: (int) config('licensing.server.token_ttl_days'),
                product:      (string) config('licensing.product'),
            )
        );
        $this->app->singleton(\App\Licensing\Server\ReleaseAuthorizer::class, fn () =>
            new \App\Licensing\Server\ReleaseAuthorizer(
                disk:          (string) config('licensing.server.release_disk'),
                urlTtlMinutes: (int) config('licensing.server.release_url_ttl_minutes'),
            )
        );
        // See App\Database\PostgresBooleanConnection - keeps real PHP booleans
        // intact for Postgres instead of Laravel's default bool->int cast, which
        // breaks every where('is_x', true/false) query against native boolean columns.
        Connection::resolverFor('pgsql', fn ($pdo, $database, $prefix, $config) =>
            new \App\Database\PostgresBooleanConnection($pdo, $database, $prefix, $config)
        );
    }

    public function boot(UrlGenerator $url): void
    {
        if ($this->app->environment('production')) {
            $url->forceScheme('https');
            $this->assertCriticalConfig();
        }

        /*
         * "s3-signed": an S3 disk whose url() returns a signed CDN link.
         *
         * The media origin demands a token on every path, and the app builds
         * media URLs in ~65 places - avatars, story covers, music artwork,
         * notification images, admin previews. Patching each one would mean
         * finding all of them, getting each right, and catching every new one
         * written afterwards. Overriding url() at the disk fixes all of them at
         * once, including code not yet written.
         *
         * Built on the stock S3 driver, so reads, writes, deletes, temporaryUrl
         * and getClient() (which the presigned-upload path needs) are unchanged.
         */
        Storage::extend('s3-signed', function ($app, array $config) {
            $disk = $app->make('filesystem')->createS3Driver($config);

            // The S3 client is passed through as the fourth argument because
            // SignedFilesystemAdapter extends AwsS3V3Adapter, which stores it
            // and is the only class that declares getClient(). Dropping it here
            // is what makes presigned uploads fatal, so all four arguments are
            // required - see the note on the adapter itself.
            return new SignedFilesystemAdapter(
                $disk->getDriver(),
                $disk->getAdapter(),
                $config,
                $disk->getClient(),
            );
        });

        $this->configureRateLimiters();


        // Send reset-password emails pointing to the Next.js frontend, not the API domain
        ResetPassword::createUrlUsing(function ($notifiable, string $token): string {
            $base = rtrim(config('app.frontend_url', 'https://teezer.live'), '/');
            return "{$base}/reset-password?token={$token}&email=" . urlencode($notifiable->getEmailForPasswordReset());
        });

        Video::observe(VideoObserver::class);
        VideoLike::observe(VideoLikeObserver::class);
        User::observe(UserSearchObserver::class);
        // Withdraws or restores earning access the moment a ban, a
        // verification or a contact detail changes - on every write path.
        User::observe(\App\Observers\UserMonetizationObserver::class);
        Hashtag::observe(HashtagObserver::class);
        AudioTrack::observe(AudioTrackObserver::class);

        // ── Analytics → ClickHouse ──────────────────────────────────────────
        // These mirror every view and engagement into the Redis stream that the Go
        // backend drains into ClickHouse. Hooked on the MODELS, not the controllers,
        // so a future code path that writes a VideoView cannot forget to report it -
        // a missed path would silently under-count, which nobody notices until a
        // creator asks why their numbers are wrong.
        //
        // The `deleted` hooks are what give ClickHouse the undo (-1) events that
        // Postgres destroys: an unlike is a row DELETE there, and the fact it ever
        // happened is gone.
        VideoView::observe(\App\Observers\Analytics\AnalyticsVideoViewObserver::class);
        VideoLike::observe(\App\Observers\Analytics\AnalyticsVideoLikeObserver::class);
        \App\Models\VideoSave::observe(\App\Observers\Analytics\AnalyticsVideoSaveObserver::class);
        \App\Models\VideoShare::observe(\App\Observers\Analytics\AnalyticsVideoShareObserver::class);
        \App\Models\VideoComment::observe(\App\Observers\Analytics\AnalyticsVideoCommentObserver::class);

        // Override mail config from app_settings if admin has configured it
        try {
            $mail = Cache::remember('app_settings_mail_config', 300, function () {
                return \App\Models\AppSetting::where('group', 'email')
                    ->pluck('value', 'key');
            });

            if ($mail->get('mail_mailer')) {
                config([
                    'mail.default'                 => $mail->get('mail_mailer'),
                    'mail.mailers.smtp.host'       => $mail->get('mail_host', config('mail.mailers.smtp.host')),
                    'mail.mailers.smtp.port'       => (int) ($mail->get('mail_port', config('mail.mailers.smtp.port'))),
                    'mail.mailers.smtp.username'   => $mail->get('mail_username', config('mail.mailers.smtp.username')),
                    'mail.mailers.smtp.password'   => $mail->get('mail_password', config('mail.mailers.smtp.password')),
                    'mail.mailers.smtp.encryption' => $mail->get('mail_encryption') ?: config('mail.mailers.smtp.encryption'),
                    'mail.from.address'            => $mail->get('mail_from_address', config('mail.from.address')),
                    'mail.from.name'               => $mail->get('mail_from_name', config('mail.from.name')),
                ]);
            }
        } catch (\Throwable) {
            // DB may not be ready yet (migrations); fall back to .env silently
        }

        $this->overrideConfigFromIntegrations();
    }

    /**
     * Layer Settings > Third-Party Integrations (IntegrationRegistry, backed by
     * the encrypted integration_settings table) over the .env-sourced config for
     * every provider a buyer would need to swap in after purchasing this
     * codebase, but that nothing was actually reading the database for yet:
     * Backblaze B2 (all media storage), Firebase (Android push) and Turnstile
     * (the CAPTCHA secret). Same technique as the mail override above - and the
     * same reason nothing here is a redeploy: IntegrationRegistry already
     * resolves database -> .env -> default per field, so an admin who has not
     * touched the panel gets exactly the .env value this always sent, and one
     * who saves new keys in the panel gets them within IntegrationRegistry's
     * cache TTL (5 minutes), no restart required.
     *
     * PayPal, Stripe and Sightengine are deliberately NOT here - they already
     * have their own working DB-backed settings (AdminCoinSetting, AppSetting)
     * wired through their services directly; routing them through here too
     * would make three sources of truth for the same secret instead of one.
     */
    private function overrideConfigFromIntegrations(): void
    {
        try {
            $b2 = \App\Services\Integrations\IntegrationRegistry::config('backblaze');
            if (filled($b2['key_id'] ?? null)) {
                // 'url' is derived from bucket + MEDIA_URL/B2_SERVE_DIRECT, which
                // stay .env-only (they're this app's own CDN routing, not a
                // third-party credential) - recomputed here with whatever bucket
                // the panel resolved to, so the two never drift apart the way
                // they would if only 'bucket' were overridden.
                $serveDirect = (bool) env('B2_SERVE_DIRECT', true);
                $mediaUrl    = rtrim((string) env('MEDIA_URL'), '/');
                $bucket      = $b2['bucket'] ?? config('filesystems.disks.b2.bucket');

                config([
                    'filesystems.disks.b2.key'      => $b2['key_id'],
                    'filesystems.disks.b2.secret'   => $b2['app_key']      ?? config('filesystems.disks.b2.secret'),
                    'filesystems.disks.b2.bucket'   => $bucket,
                    'filesystems.disks.b2.endpoint' => $b2['api_endpoint'] ?? config('filesystems.disks.b2.endpoint'),
                    'filesystems.disks.b2.region'   => $b2['region']       ?? config('filesystems.disks.b2.region'),
                    'filesystems.disks.b2.url'      => $serveDirect ? "{$mediaUrl}/file/{$bucket}" : $mediaUrl,
                ]);
            }

            $firebase = \App\Services\Integrations\IntegrationRegistry::config('firebase');
            if (filled($firebase['project_id'] ?? null) || filled($firebase['service_account'] ?? null)) {
                config([
                    // credentials may be a file path (.env, legacy) or the raw
                    // pasted JSON (admin panel) - PushService::fcmAccessToken()
                    // accepts either, see the comment there.
                    'push.fcm.project_id'  => $firebase['project_id']      ?? config('push.fcm.project_id'),
                    'push.fcm.credentials' => $firebase['service_account'] ?? config('push.fcm.credentials'),
                ]);
            }

            $turnstile = \App\Services\Integrations\IntegrationRegistry::config('turnstile');
            if (filled($turnstile['api_secret'] ?? null)) {
                config(['services.turnstile.secret' => $turnstile['api_secret']]);
            }

            /*
             * Centrifugo and LiveKit.
             *
             * Both were registered in the integrations panel - editable, with a
             * Test Connection button - while CentrifugoClient and the LiveKit
             * services kept reading config('services.*') straight from .env. So
             * rotating either key in the panel appeared to work and changed
             * nothing, and the enable toggle gated no runtime behaviour. Adding
             * them here is what makes the panel actually control them.
             *
             * Note the FIELD NAMES DIFFER from the config keys on both:
             * the registry calls the URL `api_endpoint`, Centrifugo's config
             * calls it `api_url`, and LiveKit's calls it `host`. Mapping them
             * wrongly would point a working service at nothing.
             *
             * Each key is guarded by filled() individually rather than the
             * provider as a whole, so a partially-filled panel entry can never
             * blank out a value that .env is currently supplying - these are
             * live services (Live Spaces, realtime), and a null host is an
             * outage.
             */
            $centrifugo = \App\Services\Integrations\IntegrationRegistry::config('centrifugo');
            foreach ([
                'api_key'      => 'services.centrifugo.api_key',
                'token_secret' => 'services.centrifugo.token_secret',
                'api_endpoint' => 'services.centrifugo.api_url',
            ] as $field => $configKey) {
                if (filled($centrifugo[$field] ?? null)) {
                    config([$configKey => $centrifugo[$field]]);
                }
            }

            $livekit = \App\Services\Integrations\IntegrationRegistry::config('livekit');
            foreach ([
                'api_key'      => 'services.livekit.api_key',
                'api_secret'   => 'services.livekit.api_secret',
                'api_endpoint' => 'services.livekit.host',
            ] as $field => $configKey) {
                if (filled($livekit[$field] ?? null)) {
                    config([$configKey => $livekit[$field]]);
                }
            }

            /*
             * Nominatim. LocationService reads services.nominatim.base_url, and
             * now services.nominatim.user_agent too - that header used to be a
             * literal in the service, so the panel's user_agent field did
             * nothing while Nominatim's policy makes it mandatory.
             */
            $nominatim = \App\Services\Integrations\IntegrationRegistry::config('nominatim');
            foreach ([
                'api_endpoint' => 'services.nominatim.base_url',
                'user_agent'   => 'services.nominatim.user_agent',
            ] as $field => $configKey) {
                if (filled($nominatim[$field] ?? null)) {
                    config([$configKey => $nominatim[$field]]);
                }
            }

            /*
             * ClickHouse. The registry stores a single `dsn` string while
             * services.clickhouse is structured (url/username/password/
             * database), so this parses rather than mapping dsn onto one field
             * and quietly losing the credentials inside it.
             *
             * Only the components actually present in the DSN are applied - a
             * DSN with no path must not blank the configured database name.
             */
            $clickhouse = \App\Services\Integrations\IntegrationRegistry::config('clickhouse');
            $dsn        = $clickhouse['dsn'] ?? null;

            if (filled($dsn)) {
                $parts = parse_url((string) $dsn);

                if (is_array($parts) && filled($parts['host'] ?? null)) {
                    $scheme = $parts['scheme'] ?? 'http';
                    $port   = isset($parts['port']) ? ':' . $parts['port'] : '';

                    config(['services.clickhouse.url' => "{$scheme}://{$parts['host']}{$port}"]);

                    if (filled($parts['user'] ?? null)) {
                        config(['services.clickhouse.username' => rawurldecode($parts['user'])]);
                    }
                    if (filled($parts['pass'] ?? null)) {
                        config(['services.clickhouse.password' => rawurldecode($parts['pass'])]);
                    }

                    $database = trim((string) ($parts['path'] ?? ''), '/');
                    if ($database !== '') {
                        config(['services.clickhouse.database' => $database]);
                    }
                }
            }
        } catch (\Throwable) {
            // DB may not be ready yet (migrations); fall back to .env silently
        }
    }

    /**
     * Refuse to boot in production when a secret the app cannot work without is
     * missing. Production only - local dev is left alone.
     *
     * Deliberately narrow. A guard that demanded every key would turn one unset
     * optional variable into a full outage on the next deploy, which is worse
     * than the problem it prevents. So it fails on exactly two classes of
     * mistake, neither of which can fire on a correctly configured system:
     *
     *   1. APP_KEY missing. Nothing touching encryption, sessions or signed URLs
     *      can work, and the failure otherwise surfaces later as an obscure
     *      runtime error a long way from its cause.
     *   2. A feature switched ON but missing its secret. Half-configured is
     *      always a mistake, whereas a feature deliberately switched off is not
     *      - so a disabled feature is never flagged.
     */
    private function assertCriticalConfig(): void
    {
        $missing = [];

        if (blank(config('app.key'))) {
            $missing[] = 'APP_KEY - generate with: php artisan key:generate';
        }

        // Centrifugo: api_url always has a default, so the API key is what says
        // "realtime was actually set up here". Minting JWTs against an empty HMAC
        // secret yields tokens Centrifugo rejects, so every socket silently fails.
        if (filled(config('services.centrifugo.api_key'))
            && blank(config('services.centrifugo.token_secret'))) {
            $missing[] = 'CENTRIFUGO_TOKEN_SECRET - CENTRIFUGO_API_KEY is set, so realtime is expected to work';
        }

        // Signed media: with signing on but no secret, every media URL is signed
        // with "" and the edge worker rejects all of them - the whole library
        // 403s while the API itself looks perfectly healthy.
        if (config('services.media.signed_urls')
            && blank(config('services.media.signing_secret'))) {
            $missing[] = 'MEDIA_SIGNING_SECRET - MEDIA_SIGNED_URLS is on, so every media URL is signed';
        }

        if ($missing !== []) {
            throw new \RuntimeException(
                "Refusing to boot: required production configuration is missing.\n  - "
                . implode("\n  - ", $missing)
            );
        }
    }

    private function configureRateLimiters(): void
    {
        // Login: 5 attempts per minute per account, 10 per minute per IP
        //
        // SECURITY/BUG: this read $request->input('email', '') - but
        // ApiAuthController::login() has never validated an `email` field, only
        // `login` (email OR username; the web, admin and mobile login forms all
        // send `login`, confirmed in their respective auth services). So $email
        // was always '', and every login attempt from every account, on every
        // client, collapsed onto the SAME 'login:email:' bucket - the "5 per
        // minute per account" limit was actually 5 per minute for the entire
        // site combined, tripping 429 for one legitimate user (e.g. the admin
        // panel) whenever anyone else's attempts had already used the shared
        // quota that minute.

        /* ── Marketplace licensing ──────────────────────────────────────
           Named limiters rather than a bare `throttle:N,M`: as the 'login'
           and social-login comments above explain, a numeric throttle string
           shares ONE bucket across every route on the domain that spells it
           the same way, so these would silently share a budget with unrelated
           endpoints.

           The budgets differ because the endpoints differ. Activation is the
           only one an anonymous person can reach with a guessable input, so it
           is tightest. Verify is generous: it is a scheduled heartbeat, and
           throttling a customer's re-verification is how a healthy install
           drifts into its grace window for no reason. */
        RateLimiter::for('license-activate', fn (Request $request) => [
            Limit::perMinute(5)->by('lic-act:' . $request->ip()),
            Limit::perDay(50)->by('lic-act-day:' . $request->ip()),
        ]);

        RateLimiter::for('license-install', fn (Request $request) => [
            Limit::perMinute(10)->by('lic-inst:' . $request->ip()),
            Limit::perDay(200)->by('lic-inst-day:' . $request->ip()),
        ]);

        RateLimiter::for('license-verify', fn (Request $request) =>
            Limit::perMinute(60)->by('lic-ver:' . $request->ip())
        );
        RateLimiter::for('login', function (Request $request) {
            $account = strtolower((string) $request->input('login', ''));

            // Admin/super_admin accounts get their own, longer-window policy
            // instead of the tight per-minute brute-force guard everyone else
            // gets: there are only ever a handful of these accounts, they are
            // high-trust, and they legitimately need to retry more while
            // debugging (2FA, a forgotten password, a bad role/permission
            // state) without being locked out repeatedly - which is exactly
            // what "Too many login attempts" on the admin panel was. The
            // daily cap plus a burst floor still bound the account against
            // real credential-stuffing; it isn't unthrottled.
            //
            // This does look the submitted identifier up before the password
            // is checked, which is a mild account-enumeration side channel
            // (an attacker could infer "this is an admin account" from
            // getting the more generous limit) - accepted deliberately here:
            // this app's admin roster is tiny and already effectively known,
            // and the alternative (loosening the limit for every account)
            // would weaken brute-force protection for the entire regular
            // user base instead.
            $isAdminAccount = $account !== '' && User::query()
                ->where(fn ($q) => $q->where('email', $account)->orWhere('username', $account))
                ->whereIn('role', ['admin', 'super_admin'])
                ->exists();

            if ($isAdminAccount) {
                return [
                    Limit::perDay(20)->by('login:admin-account:' . $account)->response(fn () =>
                        response()->json(['success' => false, 'message' => 'Too many login attempts for this admin account today. Please try again tomorrow, or have another administrator reset it.'], 429)
                    ),
                    // A scripted burst shouldn't be able to spend the whole
                    // day's quota in a few seconds even though the daily cap
                    // is generous.
                    Limit::perMinute(10)->by('login:admin-account-burst:' . $account)->response(fn () =>
                        response()->json(['success' => false, 'message' => 'Too many attempts in a short time. Please wait a minute.'], 429)
                    ),
                ];
            }

            return [
                Limit::perMinute(5)->by('login:account:' . $account)->response(fn () =>
                    response()->json(['success' => false, 'message' => 'Too many login attempts. Please wait a minute.'], 429)
                ),
                Limit::perMinute(10)->by('login:ip:' . $request->ip())->response(fn () =>
                    response()->json(['success' => false, 'message' => 'Too many requests from your IP. Please wait a minute.'], 429)
                ),
            ];
        });

        /*
         * Signup OTP: primarily per EMAIL, with a loose per-IP backstop.
         *
         * This was `throttle:5,1` - five per minute keyed only on IP - which
         * punished the wrong people. Behind Cloudflare, a carrier NAT, an office
         * or a campus, unrelated users share one address, so a first-time
         * visitor could hit "Too Many Attempts" on their very first tap because
         * strangers had used the quota. Keying on the email being verified makes
         * the limit follow the thing actually being protected: a mailbox cannot
         * be flooded, and one person's retries cannot lock out another's signup.
         *
         * The IP limit stays as an anti-enumeration backstop, but at a ceiling a
         * shared address reaches only through genuine abuse.
         */
        RateLimiter::for('signup-otp', function (Request $request) {
            $email = strtolower(trim((string) $request->input('email', '')));

            return [
                // Three sends per 10 minutes is room for a genuine resend or two
                // while making an inbox flood impossible.
                Limit::perMinutes(10, 3)->by('otp:email:' . $email)->response(fn () =>
                    response()->json([
                        'success' => false,
                        'message' => 'You have requested a few codes already. Please wait a few minutes, and check your spam folder.',
                    ], 429)
                ),
                Limit::perMinutes(10, 30)->by('otp:ip:' . $request->ip())->response(fn () =>
                    response()->json([
                        'success' => false,
                        'message' => 'Too many code requests from this network. Please try again shortly.',
                    ], 429)
                ),
            ];
        });

        // Social sign-in (Google/Apple/Facebook/TikTok): was bare `throttle:10,1`,
        // which shares ONE bucket with every other route on the domain also
        // using that literal string (~25 unrelated routes - payment captures,
        // family PIN, admin test-connection, spaces, etc.) because Laravel's
        // numeric throttle keys only on domain+IP (ThrottleRequests::
        // resolveRequestSignature), never the route itself - see the 'login'
        // limiter's comment above for the same class of bug. Any of those
        // firing in the same minute could burn the quota and 429 a completely
        // unrelated Google sign-in - which is exactly what "Too Many Attempts"
        // right after picking a Google account turned out to be. Isolated here
        // with its own key so social sign-in no longer collides with anything
        // else.
        RateLimiter::for('social-login', function (Request $request) {
            return Limit::perMinute(10)->by('social-login:' . $request->ip())->response(fn () =>
                response()->json(['success' => false, 'message' => 'Too many sign-in attempts. Please wait a minute and try again.'], 429)
            );
        });

        /*
         * Admin "Test Connection" buttons (Settings > Social Login and
         * Settings > Integrations).
         *
         * Both were `throttle:10,1` - and so were caught by exactly the bug
         * the social-login limiter above was written to escape, which already
         * named "admin test-connection" as one of its victims. A numeric
         * throttle keys on domain+IP (or, once signed in, on the user id
         * alone) and never on the route, so all ~25 routes using that literal
         * shared one counter. Ordinary admin-panel browsing spent it, and the
         * lowest-limit routes - these, at 10 - then answered Laravel's bare
         * "Too Many Attempts." before the button had been pressed even once.
         *
         * Keyed per admin AND per provider here, so testing Apple cannot
         * exhaust the budget for testing Google. These calls do reach a third
         * party, so a ceiling still belongs: 20/min is far above any real use
         * of a button a human clicks, and far below anything that could hammer
         * Apple or Google.
         */
        RateLimiter::for('admin-test', function (Request $request) {
            $who  = (string) ($request->user()?->getAuthIdentifier() ?? $request->ip());
            $what = (string) ($request->route('provider') ?? 'unknown');

            return Limit::perMinute(20)->by('admin-test:' . $who . ':' . $what)->response(fn () =>
                response()->json(['success' => false, 'message' => 'Too many connection tests for this provider. Please wait a minute.'], 429)
            );
        });

        // Register: 5 accounts per hour per IP (prevent mass account creation)
        RateLimiter::for('register', function (Request $request) {
            return Limit::perHour(5)->by('register:' . $request->ip())->response(fn () =>
                response()->json(['success' => false, 'message' => 'Too many registration attempts. Please try again later.'], 429)
            );
        });

        // QR-code login (QrLoginController): minting a ticket is cheap to
        // abuse, so it's a plain per-IP ceiling like register above.
        RateLimiter::for('qr-login-create', function (Request $request) {
            return Limit::perMinute(20)->by('qr-create:' . $request->ip())->response(fn () =>
                response()->json(['success' => false, 'message' => 'Too many requests. Please try again shortly.'], 429)
            );
        });

        // The website legitimately polls this every few seconds while the
        // code is on screen, so this is keyed on the TICKET, not the IP -
        // an IP-keyed limit would trip on the create-then-poll sequence
        // alone, and would also punish two people behind the same NAT
        // logging in with two different codes at once.
        RateLimiter::for('qr-login-status', function (Request $request) {
            return Limit::perMinute(40)->by('qr-status:' . $request->route('ticket'))->response(fn () =>
                response()->json(['success' => false, 'message' => 'Too many requests. Please try again shortly.'], 429)
            );
        });

        /*
         * QR login, phone side: scan / confirm / deny.
         *
         * These were `throttle:20,1` and `throttle:10,1` - the same trap the
         * social-login limiter above documents, and the reason a perfectly
         * ordinary QR approval came back "Too Many Attempts." A numeric
         * throttle on an AUTHENTICATED route keys on the user id alone
         * (ThrottleRequests::resolveRequestSignature never includes the route),
         * so every inline-throttled endpoint in this app shares one counter per
         * signed-in user. The phone spends that counter on ordinary browsing,
         * and confirm - one of the lowest limits at 10 - is then among the first
         * to be refused. The website never sees a confirmation, so it keeps
         * polling and never logs in: one cause, both halves of the bug.
         *
         * Keyed per user AND per ticket, so one QR session's approvals cannot
         * be exhausted by anything else the account is doing, and approving a
         * second login later starts from a clean budget. The limits stay where
         * they were - the counter they read was the problem, not its size.
         *
         * Still a real ceiling: a scripted attempt to brute-force ticket ids
         * needs a different ticket each time, and an unknown ticket is rejected
         * by the controller before it can be approved.
         */
        $qrTicketKey = fn (Request $request, string $action) =>
            $action . ':' . ($request->user()?->getAuthIdentifier() ?? $request->ip()) . ':' . $request->route('ticket');

        /*
         * Username availability, and the social-signup completion that depends
         * on it. Was `throttle:30,1` - a numeric throttle, so on an
         * authenticated route it keyed on the user id alone and shared one
         * counter with every other inline-throttled endpoint in this app (see
         * the QR-login and social-login limiters for the same trap). The
         * onboarding username field checks availability as the user types, so
         * it would spend that shared budget quickly and then refuse a name the
         * account is entitled to - mid-signup, with no way forward.
         *
         * Its own key, per user. 30/min is generous for a debounced field and
         * still bounds enumeration; the check reveals only whether one name is
         * taken, which is public the moment you visit a profile URL.
         */
        /*
         * Device-submitted music recognition. One result per upload in normal
         * use; the headroom covers a creator posting a burst of clips and the
         * odd retry after a dropped response. Keyed per user, so one busy
         * account cannot spend anybody else's budget - and, unlike the numeric
         * throttle this app keeps getting caught by, not shared with every
         * other endpoint the same user touches.
         */
        RateLimiter::for('music-recognition', function (Request $request) {
            return Limit::perMinute(30)
                ->by('music-recognition:' . ($request->user()?->getAuthIdentifier() ?? $request->ip()))
                ->response(fn () =>
                    response()->json(['success' => false, 'message' => 'Too many recognition updates. Please wait a moment.'], 429)
                );
        });

        /* Saving/unsaving a sound. Generous: it is a toggle on a list the user
           scrolls, so tapping several in a row is normal use, not abuse. Its
           own key, so it cannot 429 an unrelated screen. */
        RateLimiter::for('music-favorite', function (Request $request) {
            return Limit::perMinute(60)
                ->by('music-favorite:' . ($request->user()?->getAuthIdentifier() ?? $request->ip()))
                ->response(fn () =>
                    response()->json(['success' => false, 'message' => 'Too many changes. Please wait a moment.'], 429)
                );
        });

        RateLimiter::for('username-check', function (Request $request) {
            return Limit::perMinute(30)
                ->by('username-check:' . ($request->user()?->getAuthIdentifier() ?? $request->ip()))
                ->response(fn () =>
                    response()->json(['success' => false, 'message' => 'Too many checks. Please wait a moment.'], 429)
                );
        });

        /* App Attest.
         *
         * Keyed on IP, not the user: the whole point is that these are reachable
         * before anyone signs in. Challenges are minted one per protected
         * request, so the ceiling has to comfortably clear a burst of genuine
         * activity - a user opening the wallet, topping up and withdrawing in a
         * minute must not throttle themselves out of the app.
         *
         * Registration is far rarer: an install attests once, and again only
         * after a reinstall or a key invalidation. A caller hammering it is
         * either broken or probing the verifier, and neither deserves headroom.
         */
        RateLimiter::for('app-attest-challenge', function (Request $request) {
            return Limit::perMinute(60)->by('aa-chal:' . $request->ip())->response(fn () =>
                response()->json(['success' => false, 'message' => 'Too many requests. Please try again shortly.'], 429)
            );
        });

        RateLimiter::for('app-attest-register', function (Request $request) {
            return Limit::perMinute(10)->by('aa-reg:' . $request->ip())->response(fn () =>
                response()->json(['success' => false, 'message' => 'Too many requests. Please try again shortly.'], 429)
            );
        });

        RateLimiter::for('qr-login-scan', function (Request $request) use ($qrTicketKey) {
            return Limit::perMinute(20)->by($qrTicketKey($request, 'qr-scan'))->response(fn () =>
                response()->json(['success' => false, 'message' => 'Too many attempts for this code. Please try again shortly.'], 429)
            );
        });

        RateLimiter::for('qr-login-decide', function (Request $request) use ($qrTicketKey) {
            return Limit::perMinute(10)->by($qrTicketKey($request, 'qr-decide'))->response(fn () =>
                response()->json(['success' => false, 'message' => 'Too many attempts for this code. Please try again shortly.'], 429)
            );
        });

        // Password reset: 3 per HOUR per account, plus a looser per-IP ceiling.
        //
        // Keyed on both, the way the login limiter is. The per-account limit is
        // the one that matters - it caps inbox flooding and reset-link grinding
        // against a specific person. A per-IP-only rule cannot do that job and
        // punishes shared NAT (an office or a mobile carrier is one IP), so it is
        // kept as a wider backstop against spraying many accounts at once.
        RateLimiter::for('password-reset', function (Request $request) {
            $email = strtolower(trim((string) $request->input('email', '')));
            $tooMany = fn () => response()->json([
                'success' => false,
                'message' => 'Too many password reset requests. Please try again later.',
            ], 429);

            return [
                Limit::perHour(3)->by('pwd-reset:email:' . $email)->response($tooMany),
                Limit::perHour(10)->by('pwd-reset:ip:' . $request->ip())->response($tooMany),
            ];
        });

        // ── Per-action social limiters (anti-spam / anti-abuse) ────────────
        // Keyed by user id (falls back to IP for the rare unauthenticated hit).
        $key  = fn (Request $r): string => (string) ($r->user()?->id ?: $r->ip());
        $busy = fn (string $msg) => fn () => response()->json(['success' => false, 'message' => $msg], 429);

        // Comments: "too many comments in 1 minute = slow down".
        RateLimiter::for('comment-create', fn (Request $r) => [
            Limit::perMinute(10)->by('cc:' . $key($r))->response($busy("You're commenting too fast - please slow down.")),
            Limit::perHour(150)->by('cch:' . $key($r))->response($busy('Hourly comment limit reached. Try again later.')),
        ]);

        // Likes / reactions.
        RateLimiter::for('like-action', fn (Request $r) =>
            Limit::perMinute(60)->by('lk:' . $key($r))->response($busy("You're tapping like too fast - slow down a moment.")));

        // Follows / unfollows.
        RateLimiter::for('follow-action', fn (Request $r) => [
            Limit::perMinute(30)->by('fo:' . $key($r))->response($busy("You're following too fast - slow down.")),
            Limit::perDay(300)->by('fod:' . $key($r))->response($busy('Daily follow limit reached.')),
        ]);

        // Direct messages.
        RateLimiter::for('message-send', fn (Request $r) => [
            Limit::perMinute(20)->by('ms:' . $key($r))->response($busy("You're sending messages too fast - slow down.")),
            Limit::perHour(400)->by('msh:' . $key($r))->response($busy('Hourly message limit reached.')),
        ]);

        // Shares.
        RateLimiter::for('share-action', fn (Request $r) =>
            Limit::perMinute(30)->by('sh:' . $key($r))->response($busy("You're sharing too fast - slow down.")));

        // Single-video lookup (GET /videos/{id}). Video ids are plain sequential
        // integers, so "unlisted" only works if getting the link is the way in -
        // an unthrottled by-id lookup lets anyone script through ids 1, 2, 3...
        // and enumerate every unlisted video in the system. This doesn't fix
        // that (a real fix needs an unguessable share id), but it meaningfully
        // slows a naive scraper down without affecting real usage - genuine
        // traffic here is "someone opened a shared link", not rapid-fire.
        RateLimiter::for('video-lookup', fn (Request $r) =>
            Limit::perMinute(90)->by('vl:' . $key($r))->response($busy('Too many requests. Please slow down.')));
    }
}
