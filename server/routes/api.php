<?php

use App\Http\Controllers\Api\AccountController;
use App\Http\Controllers\Api\AppAttestController;
use App\Http\Controllers\Api\PremiumController;
use App\Http\Controllers\Api\ScreenTimeController;
use App\Http\Controllers\Api\RealtimeController;
use App\Http\Controllers\Api\PresenceController;
use App\Http\Controllers\Api\CallController;
use App\Http\Controllers\Api\MessageController;
use App\Http\Controllers\Api\HiddenWordController;
use App\Http\Controllers\Api\Admin\AdminApiController;
use App\Http\Controllers\Api\Admin\AdminCmsController;
use App\Http\Controllers\Api\Admin\AdminMenuController;
use App\Http\Controllers\Api\Admin\AdminUser360Controller;
use App\Http\Controllers\Api\Admin\AdminMessagesController;
use App\Http\Controllers\Api\Admin\AdminRestrictionsController;
use App\Http\Controllers\Api\Admin\AdminModerationController;
use App\Http\Controllers\Api\Admin\AdminUserController;
use App\Http\Controllers\Api\Admin\AdminReportsController;
use App\Http\Controllers\Api\Admin\AdminVerificationController;
use App\Http\Controllers\Api\Admin\AdminEmailSettingsController;
use App\Http\Controllers\Api\Admin\AdminMonetizationProgramController;
use App\Http\Controllers\Api\Admin\AdminSettingsController;
use App\Http\Controllers\Api\Admin\AdminGlobalControlsController;
use App\Http\Controllers\Api\Admin\AdminSocialLoginController;
use App\Http\Controllers\Api\Admin\AdminPaymentSettingsController;
use App\Http\Controllers\Api\Admin\AdminGiftCoinController;
use App\Http\Controllers\Api\Admin\AdminLiveStreamController;
use App\Http\Controllers\Api\Admin\AdminOverviewController;
use App\Http\Controllers\Api\Admin\AdminMonitoringController;
use App\Http\Controllers\Api\Admin\AdminSecurityController;
use App\Http\Controllers\Api\Admin\AdminVideoController;
use App\Http\Controllers\Api\Admin\AdminAdController;
use App\Http\Controllers\Api\Auth\ApiAuthController;
use App\Http\Controllers\Api\Auth\PasswordResetController;
use App\Http\Controllers\Api\Auth\TwoFactorController;
use App\Http\Controllers\Api\CountryController;
use App\Http\Controllers\Api\LocationController;
use App\Http\Controllers\Api\ModerationController;
use App\Http\Controllers\Api\AudioController;
use App\Http\Controllers\Api\MusicLibraryController;
use App\Http\Controllers\Api\Admin\AdminIntegrationController;
use App\Http\Controllers\Api\Admin\AdminMusicController;
use App\Http\Controllers\Api\Admin\AdminSpaceController;
use App\Http\Controllers\Api\Admin\AdminSoundsController;
use App\Http\Controllers\Api\Admin\AdminChallengeController;
use App\Http\Controllers\Api\ChallengeController;
use App\Http\Controllers\Api\BlockController;
use App\Http\Controllers\Api\WatchHistoryController;
use App\Http\Controllers\Api\CommentController;
use App\Http\Controllers\Api\LinkPreviewController;
use App\Http\Controllers\Api\DeviceController;
use App\Http\Controllers\Api\ExploreController;
use App\Http\Controllers\Api\SearchController;
use App\Http\Controllers\Api\FollowController;
use App\Http\Controllers\Api\TagController;
use App\Http\Controllers\Api\CollabController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\StoryController;
use App\Http\Controllers\Api\Studio\CreatorEligibilityController;
use App\Http\Controllers\Api\Studio\StudioAnalyticsController;
use App\Http\Controllers\Api\Studio\StudioCommentController;
use App\Http\Controllers\Api\Studio\StudioContentController;
use App\Http\Controllers\Api\Studio\StudioDashboardAnalyticsController;
use App\Http\Controllers\Api\Studio\StudioDashboardController;
use App\Http\Controllers\Api\Studio\StudioInsightsController;
use App\Http\Controllers\Api\Studio\StudioLiveController;
use App\Http\Controllers\Api\Studio\StudioMonetizationController;
use App\Http\Controllers\Api\Studio\StudioPromotionController;
use App\Http\Controllers\Api\Studio\StudioAdCampaignController;
use App\Http\Controllers\Api\Studio\StudioAdGroupController;
use App\Http\Controllers\Api\Studio\StudioAdCreativeController;
use App\Http\Controllers\Api\Studio\StudioAdAccountController;
use App\Http\Controllers\Api\Studio\StudioAdInsightsController;
use App\Http\Controllers\Api\Studio\StudioSettingsController;
use App\Http\Controllers\Api\Studio\StudioSubscriptionController;
use App\Http\Controllers\Api\Studio\TaxFormController;
use App\Http\Controllers\Api\Studio\StudioWalletCoinsController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\UploadCancelController;
use App\Http\Controllers\Api\VideoStreamController;
use App\Http\Controllers\Api\InternalTranscodeController;
use App\Http\Controllers\Api\VerificationController;
use App\Http\Controllers\Api\VerificationPaymentController;
use App\Http\Controllers\Api\FeedController;
use App\Http\Controllers\Api\ExplorePulseController;
use App\Http\Controllers\Api\HlsPlaylistController;
use App\Http\Controllers\Api\MultipartUploadController;
use App\Http\Controllers\Api\VideoController;
use App\Http\Controllers\Api\VideoMusicRecognitionController;
use App\Http\Controllers\Api\VideoEventController;
use App\Http\Controllers\Api\AdEventController;
use App\Http\Controllers\Api\AdController;
use App\Http\Controllers\Api\VideoInteractionController;
use App\Http\Controllers\Api\WalletController;
use App\Http\Controllers\Api\GiftController;
use App\Http\Controllers\Api\SuggestionController;
use App\Http\Controllers\Api\WatchController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->name('api.v1.')->group(function () {

    // ── Health ────────────────────────────────────────────────────────
    Route::get('/health', HealthController::class)->name('health');

    // ── Internal (Cloudflare Worker → VPS, secret-authenticated) ─────
    // Never place under auth:sanctum - the Worker uses X-Internal-Secret, not Bearer tokens.
    Route::post('/internal/transcode', [InternalTranscodeController::class, 'trigger'])
        ->name('internal.transcode')
        ->middleware('throttle:10,1');

    // ── StreamHub / LiveKit webhooks (LiveKit server → VPS) ──────────
    // Never place under auth:sanctum - verified by its own signed
    // Authorization header (Agence104\LiveKit\WebhookReceiver), not Bearer.
    Route::post('/streamhub/webhook', [\App\StreamHub\LiveKitWebhookController::class, 'handle'])
        ->name('streamhub.webhook')
        ->middleware('throttle:120,1');

    // ── api.video webhooks (external transcoding provider → VPS) ─────
    // Never place under auth:sanctum - verified by X-Api-Video-Signature
    // (HMAC SHA256), see ApiVideoWebhookController.
    Route::post('/webhooks/apivideo', [\App\Http\Controllers\Api\ApiVideoWebhookController::class, 'handle'])
        ->name('webhooks.apivideo')
        ->middleware('throttle:120,1');


    /* ── Marketplace licensing (LICENSOR SIDE) ─────────────────────────
       Only reelsoo.com serves these. They are the licence server: the
       activation page posts to /activate, and a customer's installer and
       heartbeat post to /install, /verify and /release.

       Unauthenticated by Sanctum on purpose - a customer VPS has no Reelsoo
       user account, and section 23 forbids coupling licences to social auth.
       The credential is the purchase code / licence key, checked by hash.

       Registered only when licensing.server.enabled, so the licence server
       cannot go live by accident on a deploy, and a customer package (which
       ships with it false) exposes no activation surface at all. */
    if (config('licensing.server.enabled')) {
        Route::prefix('license')->name('license.')->group(function () {
            Route::post('/activate', [\App\Http\Controllers\Api\License\ActivationController::class, 'activate'])
                 ->middleware('throttle:license-activate')->name('activate');
            Route::post('/install',  [\App\Http\Controllers\Api\License\InstallationController::class, 'install'])
                 ->middleware('throttle:license-install')->name('install');
            Route::post('/verify',   [\App\Http\Controllers\Api\License\InstallationController::class, 'verify'])
                 ->middleware('throttle:license-verify')->name('verify');
            Route::post('/release',  [\App\Http\Controllers\Api\License\InstallationController::class, 'release'])
                 ->middleware('throttle:license-install')->name('release');
        });
    }

    /* ── First-run setup wizard (CLIENT SIDE, ships to customers) ──────
       Unauthenticated by necessity: at this point the installation has no
       account to authenticate with. SetupController refuses every call once
       setup has completed, so this is not a standing "make me an admin"
       endpoint - see that controller's docblock. */
    Route::prefix('setup')->name('setup.')->group(function () {
        Route::get('/status',    [\App\Http\Controllers\Api\Setup\SetupController::class, 'status'])
             ->middleware('throttle:30,1')->name('status');
        Route::post('/complete', [\App\Http\Controllers\Api\Setup\SetupController::class, 'complete'])
             ->middleware('throttle:5,10')->name('complete');
    });
    // ── Public app config (features, menus) - safe for frontend/app ────
    /* Site identity + SEO for the frontend's server-rendered <head>.
       Public because everything it returns already appears in the served HTML;
       there is nothing here that is not on the page anyway. Cached hard at the
       edge and in the app - it changes only when an admin saves. */
    Route::get('/app/site', function () {
        return response()
            ->json(['success' => true, 'data' => \App\Services\PlatformSettings::site()])
            ->header('Cache-Control', 'public, max-age=60, s-maxage=300');
    })->name('app.site');
    Route::get('/app/features', [AdminSettingsController::class, 'features'])->name('app.features');
    Route::get('/app/settings', function () {
        return response()->json(['success' => true, 'data' => \App\Models\AppSetting::publicSettings()]);
    })->name('app.settings');
    /* Turnstile public config for the login forms. The site key is a public
       value by design (it is embedded in every page that renders the widget);
       the secret never leaves the server. Lets the web/admin login pick up a
       key pasted in Admin > Integrations without rebuilding the frontends.
       `enabled` mirrors TurnstileService::enabled() - i.e. whether the API
       will actually demand a token. */
    Route::get('/app/turnstile', function (\App\Services\TurnstileService $turnstile) {
        $enabled = $turnstile->enabled();
        $siteKey = $enabled
            ? (string) \App\Services\Integrations\IntegrationRegistry::get('turnstile', 'site_key', '')
            : '';
        return response()
            ->json(['success' => true, 'data' => ['enabled' => $enabled, 'site_key' => $siteKey]])
            ->header('Cache-Control', 'public, max-age=30, s-maxage=30');
    })->name('app.turnstile');
    Route::get('/app/menus', function () {
        return response()->json(['success' => true, 'data' => \App\Models\MenuItem::where('is_enabled', true)->orderBy('sort_order')->get()]);
    })->name('app.menus');
    /* Global Reelsoo Control - safe key=>bool map for Website/Android/iOS.
       Nothing here is secret, only behaviour flags, so the whole map is
       public. This is a courtesy for graceful client UI (spec §34); the
       real guarantee is EnsureGlobalControlEnabled running on every request
       regardless of whether a client ever calls this. Short cache: unlike
       /app/site, an admin flipping an emergency switch needs this to catch
       up in seconds, not minutes. */
    Route::get('/app/global-controls', function (\App\Services\GlobalControls\GlobalControlService $controls) {
        return response()
            ->json(['success' => true, 'data' => $controls->publicConfig()])
            ->header('Cache-Control', 'public, max-age=15, s-maxage=15');
    })->name('app.global-controls');
    // Public read side of CMS & Legal - every legal/policy page (web) and
    // PoliciesScreen.tsx (mobile) calls this by its own slug. See
    // CmsController for why a null `data` means "not published here yet".
    Route::get('/app/cms/{slug}', [\App\Http\Controllers\Api\CmsController::class, 'show'])->name('app.cms.show');

    // ── Public payment config - exposes only public keys (no secrets) ───
    //
    // "No secrets" was true for paypal/stripe/razorpay (a client_id/
    // publishable_key/key_id is DESIGNED to be public - that's what
    // "publishable" means) but was NOT true for `bank`: account_number,
    // routing_number and swift_code are real account credentials, not public
    // identifiers, and this route has no auth at all. Anyone could read the
    // platform's own bank account details with a plain unauthenticated GET.
    // The three actual credential fields now only appear for a signed-in
    // requester; enabled/account_holder/bank_name/instructions stay public
    // so a guest can still see that bank transfer is offered before logging
    // in to actually use it.
    Route::get('/payment-config', function (\Illuminate\Http\Request $request) {
        // optional.sanctum below is what makes $request->user() resolve here -
        // without it this would always be null regardless of whether a valid
        // token was sent, silently hiding the bank fields from legitimate
        // signed-in requesters too, not just guests.
        $authed = (bool) $request->user();

        return response()->json([
            'success' => true,
            'data'    => [
                'paypal' => [
                    'enabled'   => (bool)   \App\Models\AdminCoinSetting::getValue('paypal_enabled', 1),
                    'client_id' => (string) (\App\Models\AdminCoinSetting::getValue('paypal_client_id') ?: ''),
                    'mode'      => (string) (\App\Models\AdminCoinSetting::getValue('paypal_mode') ?: 'sandbox'),
                ],
                'stripe' => [
                    'enabled'         => (bool)   \App\Models\AdminCoinSetting::getValue('stripe_enabled', 1),
                    'publishable_key' => (string) (\App\Models\AdminCoinSetting::getValue('stripe_publishable_key') ?: ''),
                ],
                'razorpay' => [
                    'enabled' => (bool)   \App\Models\AdminCoinSetting::getValue('razorpay_enabled', 1),
                    'key_id'  => (string) (\App\Models\AdminCoinSetting::getValue('razorpay_key_id') ?: ''),
                ],
                'bank' => [
                    'enabled'        => (bool)   \App\Models\AdminCoinSetting::getValue('bank_enabled', 1),
                    'account_holder' => (string) (\App\Models\AdminCoinSetting::getValue('bank_account_holder') ?: ''),
                    'bank_name'      => (string) (\App\Models\AdminCoinSetting::getValue('bank_name') ?: ''),
                    'account_number' => $authed ? (string) (\App\Models\AdminCoinSetting::getValue('bank_account_number') ?: '') : null,
                    'routing_number' => $authed ? (string) (\App\Models\AdminCoinSetting::getValue('bank_routing_number') ?: '') : null,
                    'swift_code'     => $authed ? (string) (\App\Models\AdminCoinSetting::getValue('bank_swift_code') ?: '') : null,
                    'instructions'   => (string) (\App\Models\AdminCoinSetting::getValue('bank_enabled_instructions') ?: ''),
                ],
                'pricing' => [
                    'subscription_monthly' => (float) \App\Models\AdminCoinSetting::getValue('subscription_monthly_price', 4.99),
                    'subscription_annual'  => (float) \App\Models\AdminCoinSetting::getValue('subscription_annual_price', 39.99),
                    'badge_price'          => (float) \App\Models\AdminCoinSetting::getValue('badge_price', 9.99),
                ],
            ],
        ]);
    })->middleware('optional.sanctum')->name('payment-config');

    // ── Premium page (plans, feature grid, comparison, FAQ) ───────────
    // Public: the page has to sell to signed-out users too. The caller's own
    // subscription is NOT here - that stays on /studio/subscriptions, which the
    // app calls alongside this, so there is one source of truth for it.
    /* Coupon check. Public alongside /premium because the premium page shows
       the discount before anyone signs in - redemption is what requires an
       account, and that happens at payment time, not here. */
    Route::post('/premium/coupon/validate', [PremiumController::class, 'validateCoupon'])
        ->name('premium.coupon.validate');

    Route::get('/premium', [PremiumController::class, 'index'])
        ->middleware('throttle:60,1')
        ->name('premium');

    // ── Live search (Meilisearch proxy - admin key never leaves backend) ──
    Route::get('/search', [SearchController::class, 'search'])
        ->name('search')
        ->middleware('throttle:60,1');

    // ── Public country detection (signup auto-fill) ───────────────────
    Route::get('/detect-country', [CountryController::class, 'detect'])
        ->middleware('throttle:60,1')
        ->name('detect-country');

    // ── Public: every country's signup availability, for the dropdown ──
    Route::get('/countries/availability', [CountryController::class, 'availabilityList'])
        ->middleware('throttle:60,1')
        ->name('countries.availability');

    // ── Public Auth ───────────────────────────────────────────────────
    /* App Attest.
     *
     * Public, and NOT under the auth prefix, deliberately: the endpoints most
     * worth attesting (register, login) have nobody signed in yet, so a
     * session-gated bootstrap would be useless exactly where it matters. Both
     * are safe to expose - a challenge is worthless without a Secure Enclave
     * key, and a bad attestation is simply rejected - but minting and verifying
     * both cost work, hence named limiters rather than a bare throttle (a
     * numeric throttle on an authenticated route keys on the user alone and
     * silently shares one counter with ~25 unrelated endpoints; see
     * AppServiceProvider::configureRateLimiters). */
    Route::prefix('app-attest')->name('app-attest.')->middleware('optional.sanctum')->group(function () {
        Route::post('/challenge', [AppAttestController::class, 'challenge'])
             ->middleware('throttle:app-attest-challenge')->name('challenge');
        Route::post('/key',       [AppAttestController::class, 'register'])
             ->middleware('throttle:app-attest-register')->name('key');
    });

    Route::prefix('auth')->name('auth.')->group(function () {
        Route::post('/register',            [ApiAuthController::class, 'register'])->middleware('throttle:register')->name('register');
        Route::post('/login',               [ApiAuthController::class, 'login'])->middleware('throttle:login')->name('login');
        Route::post('/two-factor-challenge', [ApiAuthController::class, 'twoFactorChallenge'])->middleware('throttle:10,1')->name('two-factor-challenge');

        // Social sign-in (mobile): verify provider token → issue Sanctum token
        Route::post('/social/google',   [ApiAuthController::class, 'socialGoogle'])->middleware('throttle:social-login')->name('social.google');
        Route::post('/social/apple',    [ApiAuthController::class, 'socialApple'])->middleware('throttle:social-login')->name('social.apple');
        Route::post('/social/facebook', [ApiAuthController::class, 'socialFacebook'])->middleware('throttle:social-login')->name('social.facebook');
        Route::post('/social/tiktok',   [ApiAuthController::class, 'socialTiktok'])->middleware('throttle:social-login')->name('social.tiktok');
        Route::post('/forgot-password',     [PasswordResetController::class, 'sendLink'])->middleware('throttle:password-reset')->name('forgot-password');
        Route::post('/reset-password',      [PasswordResetController::class, 'reset'])->middleware('throttle:3,10')->name('reset-password');
        Route::post('/verify-email',        [ApiAuthController::class, 'verifyEmail'])->name('verify-email');

        // ── Signup OTP / email verification ──
        Route::get('/check-username',       [ApiAuthController::class, 'checkUsernamePublic'])->middleware('throttle:30,1')->name('check-username');
        Route::post('/send-otp',            [ApiAuthController::class, 'sendSignupOtp'])->middleware('throttle:signup-otp')->name('send-otp');
        Route::post('/verify-otp',          [ApiAuthController::class, 'verifySignupOtp'])->middleware('throttle:10,1')->name('verify-otp');
        Route::get('/verify-email-link',    [ApiAuthController::class, 'verifyEmailLink'])->middleware('throttle:10,1')->name('verify-email-link');
        Route::get('/signup-draft/{token}', [ApiAuthController::class, 'getSignupDraft'])->middleware('throttle:20,1')->name('signup-draft');

        // ── Internal SSO (cross-subdomain recognition + OAuth-style consent) ──
        // Authenticated by the shared `.reelsoo.com` cookie, NOT auth:sanctum.
        Route::get('/sso/session',   [\App\Http\Controllers\Api\Auth\SsoController::class, 'session'])->middleware('throttle:60,1')->name('sso.session');
        Route::post('/sso/login',     [\App\Http\Controllers\Api\Auth\SsoController::class, 'login'])->middleware('throttle:30,1')->name('sso.login');
        Route::post('/sso/authorize', [\App\Http\Controllers\Api\Auth\SsoController::class, 'authorize'])->middleware('throttle:20,1')->name('sso.authorize');

        // ── QR-code login: website's "Use QR code" button ──
        // Unauthenticated on purpose - the whole point is logging IN. The
        // phone-side half (scan/confirm/deny) is authenticated, further down
        // in this file's auth:sanctum group.
        Route::post('/qr/create',          [\App\Http\Controllers\Api\Auth\QrLoginController::class, 'create'])->middleware('throttle:qr-login-create')->name('qr.create');
        Route::get('/qr/status/{ticket}',  [\App\Http\Controllers\Api\Auth\QrLoginController::class, 'status'])->middleware('throttle:qr-login-status')->name('qr.status');
    });

    // ── Public reads (optional Bearer auth for personalized data) ───
    Route::middleware('optional.sanctum')->group(function () {
    // Must be before /{username} wildcard or "mention-search" is absorbed as a username
    Route::get('/users/mention-search', [\App\Http\Controllers\Api\MentionController::class, 'search'])
        ->middleware('auth:sanctum')
        ->name('users.mention-search');
    Route::get('/users/{username}',          [UserController::class, 'show'])->name('users.show');
    Route::get('/users/{username}/videos',   [UserController::class, 'videos'])->name('users.videos');
    Route::get('/users/{username}/stories',  [StoryController::class, 'userStories'])->name('users.stories');
    Route::get('/users/{username}/drafts',   [UserController::class, 'drafts'])->middleware('auth:sanctum')->name('users.drafts');
    // The Shop tab on a profile - same public-read shape as /users/{username}
    // above, just scoped to the storefront rather than the whole profile.
    // Must be before /shops/{username} or "categories" would be absorbed as a username.
    Route::get('/shops/categories',             [\App\Http\Controllers\Api\ShopController::class, 'categories'])->name('shops.categories');
    // Shop marketplace home content - admin-authored via the "Reelsoo Shop"
    // admin panel section. Must be before /shops/{username} for the same
    // reason /shops/categories already is.
    Route::get('/shops/promo-banners',          [\App\Http\Controllers\Api\ShopController::class, 'promoBanners'])->name('shops.promo-banners');
    Route::get('/shops/deals',                  [\App\Http\Controllers\Api\ShopController::class, 'deals'])->name('shops.deals');
    Route::get('/shops/coupons',                [\App\Http\Controllers\Api\ShopController::class, 'coupons'])->name('shops.coupons');
    // Add Product's price field - list to pick from, detected one to pre-fill.
    Route::get('/shops/currencies',              [\App\Http\Controllers\Api\ShopController::class, 'currencies'])->name('shops.currencies');
    Route::get('/shops/detect-currency',         [\App\Http\Controllers\Api\ShopController::class, 'detectCurrency'])->name('shops.detect-currency');
    // Add Product's "Add Variation" sheet - preset types/options dropdown.
    Route::get('/shops/variation-types',         [\App\Http\Controllers\Api\ShopController::class, 'variationTypes'])->name('shops.variation-types');
    Route::get('/shops/{username}',             [\App\Http\Controllers\Api\ShopController::class, 'show'])->name('shops.show');
    Route::get('/shops/{username}/products',    [\App\Http\Controllers\Api\ShopController::class, 'products'])->name('shops.products');
    Route::get('/shops/{username}/collections', [\App\Http\Controllers\Api\ShopController::class, 'collections'])->name('shops.collections');
    Route::get('/shops/{username}/reviews',     [\App\Http\Controllers\Api\ShopController::class, 'reviews'])->name('shops.reviews');
    // Single-product detail for a checkout/detail screen - see ShopController::productShow.
    Route::get('/products/{id}', [\App\Http\Controllers\Api\ShopController::class, 'productShow'])->whereNumber('id')->name('products.show');
    // NOTE: followers/following LIST requires auth - guests see counts only via /users/{username}
    // NOTE: keyword routes MUST come before {id} or "/videos/feed" would
    // resolve to show() with id="feed" → TypeError.
    // HLS playlists are generated per request so every segment line carries its
    // own signature - a player never sends the parent's query string down to a
    // relative segment, so a signed master alone would leave the .ts files open.
    // Public route: the signature IS the authorisation, and a guest watching a
    // published video is a normal case.
    Route::get('/videos/{video}/hls/master.m3u8', [HlsPlaylistController::class, 'show'])
        ->whereNumber('video')->name('videos.hls.master')->middleware('throttle:300,1');
    Route::get('/videos/{video}/hls/{variant}/index.m3u8', [HlsPlaylistController::class, 'show'])
        ->whereNumber('video')->name('videos.hls.variant')->middleware('throttle:300,1');

    Route::get('/videos/feed',     [VideoController::class, 'feed'])->name('videos.feed');
    Route::get('/videos/trending', [VideoController::class, 'trending'])->name('videos.trending');

    // Location feed - posts manually tagged with a place (exact saved string).
    Route::get('/locations/{slug}/videos', [\App\Http\Controllers\Api\LocationFeedController::class, 'videos'])
        ->middleware('throttle:60,1')->name('locations.videos');
    Route::get('/locations/{slug}/nearby', [\App\Http\Controllers\Api\LocationFeedController::class, 'nearby'])
        ->middleware('throttle:60,1')->name('locations.nearby');
    // The About tab, and other places posted from in the same country. Public
    // and cached-friendly like the two above, and sharing their limiter.
    Route::get('/locations/{slug}/about', [\App\Http\Controllers\Api\LocationFeedController::class, 'about'])
        ->middleware('throttle:60,1')->name('locations.about');
    Route::get('/locations/{slug}/nearby-places', [\App\Http\Controllers\Api\LocationFeedController::class, 'nearbyPlaces'])
        ->middleware('throttle:60,1')->name('locations.nearby-places');

    // ── Recommendation engine ──────────────────────────────────────────
    Route::get('/feed/for-you', [FeedController::class, 'forYou'])->name('feed.for-you');
    // The feed's country tab - country resolved server-side from the account
    // (or Cloudflare's header for a guest), never from a client parameter.
    Route::get('/feed/country', [FeedController::class, 'country'])->name('feed.country');
    Route::get('/feed/trending-hashtags', [\App\Http\Controllers\Api\HashtagController::class, 'feedTrending'])->name('feed.trending-hashtags');
    Route::delete('/feed/reset-preferences', [FeedController::class, 'resetPreferences'])->middleware('auth:sanctum')->name('feed.reset-preferences');

    Route::get('/videos/{id}',       [VideoController::class, 'show'])->where('id', '[0-9]+')->middleware('throttle:video-lookup')->name('videos.show');
    // Token-signed stream URL for private/draft videos (token is the auth - no Bearer required)
    Route::get('/videos/{id}/stream', [VideoStreamController::class, 'show'])->where('id', '[0-9]+')->name('videos.stream');
    Route::post('/videos/{id}/view', [VideoController::class, 'recordView'])->where('id', '[0-9]+')->name('videos.view');
    // Watch time tracking
    Route::prefix('watch')->name('watch.')->group(function () {
        Route::post('/start',    [WatchController::class, 'start'])->name('start')->middleware('throttle:120,1');
        Route::post('/progress', [WatchController::class, 'progress'])->name('progress')->middleware('throttle:600,1');
        Route::post('/end',      [WatchController::class, 'end'])->name('end')->middleware('throttle:120,1');
    });
    // Share is public so guest copy-link/social shares still count
    Route::post('/videos/{id}/share', [VideoInteractionController::class, 'share'])->where('id', '[0-9]+')->name('videos.share.public')->middleware('throttle:60,1');
    // Comments list is public - guests may read without logging in (POST still requires auth)
    Route::get('/videos/{id}/comments', [CommentController::class, 'index'])->where('id', '[0-9]+')->name('videos.comments.public');
    // Guest suggestions - IP-based country, no auth required
    Route::get('/suggestions/guest', [SuggestionController::class, 'guest'])->name('suggestions.guest')->middleware('throttle:30,1');
    // Comment replies (public - guests may read replies)
    Route::get('/comments/{id}/replies', [CommentController::class, 'replies'])->where('id', '[0-9]+')->name('comments.replies.public');
    // Link previews are public so guests viewing captions/comments/profiles get cards too (SSRF-guarded + throttled)
    Route::get('/link-preview', [LinkPreviewController::class, 'show'])->name('link-preview.public')->middleware('throttle:60,1');

    Route::prefix('explore')->name('explore.')->group(function () {
        Route::get('/trending',         [ExploreController::class, 'trending'])->name('trending');
        Route::get('/featured',         [ExploreController::class, 'featured'])->name('featured');
        // "Moving today" - week-over-week movements with the delta that earned
        // each row its place. Country-aware, so the local row matches the
        // Nearby section's country.
        Route::get('/categories',       [ExploreController::class, 'categories'])->name('categories');
        Route::get('/sounds',           [ExploreController::class, 'sounds'])->name('sounds');
        Route::get('/tags',             [ExploreController::class, 'tags'])->name('tags');
        Route::get('/nearby-creators',  [\App\Http\Controllers\Api\ExplorePlacesController::class, 'nearbyCreators'])
            ->middleware('throttle:60,1')->name('nearby-creators');
        Route::get('/pulse',            [ExplorePulseController::class, 'index'])
            ->middleware('throttle:60,1')->name('pulse');
        Route::get('/hashtags',         [ExploreController::class, 'hashtags'])->name('hashtags');
        Route::get('/hashtags/{name}',  [ExploreController::class, 'hashtagVideos'])->name('hashtag-videos');
        Route::get('/search',           [ExploreController::class, 'search'])->name('search');
        Route::get('/top-creators',     [ExploreController::class, 'topCreators'])->name('top-creators');

        // "Nearby in {country}" section - place chips + place cards, derived
        // from the same free-text `videos.location` column as /locations/*.
        Route::get('/places',                [\App\Http\Controllers\Api\ExplorePlacesController::class, 'places'])
            ->middleware('throttle:60,1')->name('places');
        Route::get('/places/{place}/nearby',  [\App\Http\Controllers\Api\ExplorePlacesController::class, 'nearby'])
            ->middleware('throttle:60,1')->name('places.nearby');
    });

    // Trending hashtags by usage in the last N days (default 7)
    Route::get('/hashtags/trending', [\App\Http\Controllers\Api\HashtagController::class, 'trending'])->name('hashtags.trending');

    // Hashtag Challenges - the Explore page's "join a challenge" cards. Public,
    // like /explore/hashtags: guests browse and open a challenge, only Join
    // (below, in the authed group) needs a session.
    Route::prefix('explore/challenges')->name('explore.challenges.')->group(function () {
        Route::get('/',              [ChallengeController::class, 'index'])->name('index');
        Route::get('/{challenge}',   [ChallengeController::class, 'show'])->whereNumber('challenge')->name('show');
        Route::get('/{challenge}/entries', [ChallengeController::class, 'entries'])->whereNumber('challenge')->name('entries');
    });

    // Spaces (live audio rooms) - the app's Spaces tab. Public, like the feed:
    // guests browse and can look inside a room; signing in is needed to take a
    // seat, speak, or host.
    Route::get('/spaces', [\App\Http\Controllers\Api\SpaceController::class, 'index'])->name('spaces.index');

    /* ── Live streams (audience side) ────────────────────────────────────
       Browsing and watching are public; posting a chat line is not, and the
       controller refuses a guest rather than the route, so the reason reaches
       the viewer. Presence is open to guests so a signed-out watcher still
       counts once. */
    Route::prefix('live-streams')->name('live-streams.')->group(function () {
        Route::get('/',                  [\App\Http\Controllers\Api\LiveStreamController::class, 'index'])->name('index');
        Route::get('/{id}',              [\App\Http\Controllers\Api\LiveStreamController::class, 'show'])->whereNumber('id')->name('show');
        Route::get('/{id}/messages',     [\App\Http\Controllers\Api\LiveStreamController::class, 'messages'])->whereNumber('id')->name('messages');
        Route::post('/{id}/join',        [\App\Http\Controllers\Api\LiveStreamController::class, 'join'])->whereNumber('id')->name('join');
        Route::post('/{id}/leave',       [\App\Http\Controllers\Api\LiveStreamController::class, 'leave'])->whereNumber('id')->name('leave');
        Route::post('/{id}/messages',    [\App\Http\Controllers\Api\LiveStreamController::class, 'postMessage'])
            ->whereNumber('id')->middleware('auth:sanctum')->name('messages.store');
        Route::post('/{id}/report',      [\App\Http\Controllers\Api\LiveStreamController::class, 'report'])
            ->whereNumber('id')->middleware(['auth:sanctum', 'throttle:30,1'])->name('report');
    });
    Route::get('/spaces/{space}', [\App\Http\Controllers\Api\SpaceRoomController::class, 'show'])
        ->whereNumber('space')->name('spaces.show');
    // The "People in this Space" sheet - public, like the room itself.
    Route::get('/spaces/{space}/people', [\App\Http\Controllers\Api\SpaceRoomController::class, 'people'])
        ->whereNumber('space')->name('spaces.people');
    // The Listeners screen and the room's chat - both browsable by guests, so
    // they sit with the public reads. Writing to either needs a seat (below).
    Route::get('/spaces/{space}/listeners', [\App\Http\Controllers\Api\SpaceRoomController::class, 'listeners'])
        ->whereNumber('space')->name('spaces.listeners');
    Route::get('/spaces/{space}/messages', [\App\Http\Controllers\Api\SpaceChatController::class, 'index'])
        ->whereNumber('space')->name('spaces.messages.index');
    // Playing a replay is browsing, not taking part, so it sits with the public
    // reads. Throttled because it moves a counter.
    Route::post('/spaces/{space}/replay', [\App\Http\Controllers\Api\SpaceReminderController::class, 'play'])
        ->whereNumber('space')->middleware('throttle:30,1')->name('spaces.replay');

    Route::prefix('audio')->name('audio.')->group(function () {
        Route::get('/',             [AudioController::class, 'index'])->name('index');
        Route::get('/trending',     [AudioController::class, 'trending'])->name('trending');
        Route::get('/search',       [AudioController::class, 'search'])->name('search');
        Route::get('/{id}',         [AudioController::class, 'show'])->name('show');
        Route::get('/{id}/videos',  [AudioController::class, 'videos'])->name('videos');
    });

    // ── Music Library (public - studio + content picker + detail pages) ──────
    Route::prefix('music')->name('music.')->group(function () {
        Route::get('/library',        [MusicLibraryController::class, 'library'])->name('library');
        Route::get('/picker',         [MusicLibraryController::class, 'picker'])->name('picker');
        Route::get('/trending',        [MusicLibraryController::class, 'trending'])->name('trending');
        Route::get('/weekly-popular', [MusicLibraryController::class, 'weeklyPopular'])->name('weekly-popular');
        Route::post('/{id}/play',     [MusicLibraryController::class, 'play'])->where('id', '[0-9]+')->name('play');
        Route::get('/{id}',           [MusicLibraryController::class, 'show'])->where('id', '[0-9]+')->name('show');
        Route::get('/{id}/videos',    [MusicLibraryController::class, 'videos'])->where('id', '[0-9]+')->name('show.videos');
    });
    }); // optional.sanctum

    // ── Authenticated Routes ──────────────────────────────────────────
    Route::middleware(['auth:sanctum', 'not.banned'])->group(function () {

        // Claiming a Shop marketplace coupon into the caller's own wallet -
        // see ShopController::claimCoupon(). Needs a real user, unlike the
        // public GET /shops/coupons this sits alongside.
        Route::post('/shops/coupons/{id}/claim', [\App\Http\Controllers\Api\ShopController::class, 'claimCoupon'])
            ->where('id', '[0-9]+')->name('shops.coupons.claim');

        // Two-factor authentication management (available to every user;
        // mandatory for admins - see ApiAdminMiddleware).
        Route::prefix('auth/two-factor')->name('auth.two-factor.')->middleware('throttle:20,1')->group(function () {
            Route::get('/status',         [TwoFactorController::class, 'status'])->name('status');
            Route::post('/setup',         [TwoFactorController::class, 'setup'])->name('setup');
            Route::post('/confirm',       [TwoFactorController::class, 'confirm'])->name('confirm');
            Route::post('/disable',       [TwoFactorController::class, 'disable'])->name('disable');
            Route::post('/recovery-codes',[TwoFactorController::class, 'recoveryCodes'])->name('recovery-codes');
        });

        // Audio (authenticated)
        Route::prefix('audio')->name('audio.')->group(function () {
            Route::get('/my-sounds',        [AudioController::class, 'mySounds'])->name('my-sounds');
            Route::get('/favorites',        [AudioController::class, 'favorites'])->name('favorites');
            Route::post('/{id}/favorite',   [AudioController::class, 'toggleFavorite'])->name('toggle-favorite');
        });

        // Music Library - authenticated actions (use, favorites)
        Route::post('/music/{id}/use', [MusicLibraryController::class, 'use'])
            ->where('id', '[0-9]+')
            ->name('music.use')
            ->middleware('throttle:120,1');

        // Saved sounds, for the compose flow's sound browser. `favorites` can
        // never be swallowed by the public GET /music/{id} above: that route
        // constrains its id to [0-9]+.
        Route::get('/music/favorites', [MusicLibraryController::class, 'favorites'])
            ->name('music.favorites');

        // A NAMED limiter, not an inline throttle:N,M. Laravel keys an inline
        // limit on the user id alone for authenticated requests, with no route
        // in the signature, so every inline-throttled route shares one counter
        // per user - which is what made unrelated screens return 429 for each
        // other. A named limiter builds its own key.
        Route::post('/music/{id}/favorite', [MusicLibraryController::class, 'toggleFavorite'])
            ->where('id', '[0-9]+')
            ->middleware('throttle:music-favorite')
            ->name('music.favorite');

        // Stories
        Route::prefix('stories')->name('stories.')->group(function () {
            Route::get('/feed',             [StoryController::class, 'feed'])->name('feed');
            Route::get('/active-user-ids',  [StoryController::class, 'activeUserIds'])->name('active-user-ids');
            Route::get('/my',           [StoryController::class, 'myStories'])->name('my');
            Route::get('/drafts',       [StoryController::class, 'drafts'])->name('drafts');
            Route::get('/search-users', [StoryController::class, 'searchUsers'])->name('search-users');
            Route::post('/',             [StoryController::class, 'store'])->name('store');
            Route::post('/from-video',   [StoryController::class, 'fromVideo'])->name('from-video');
            Route::post('/{id}/view',   [StoryController::class, 'view'])->where('id', '[0-9]+')->name('view');
            Route::post('/{id}/react',  [StoryController::class, 'react'])->where('id', '[0-9]+')->name('react');
            Route::post('/{id}/reply',  [StoryController::class, 'reply'])->where('id', '[0-9]+')->name('reply');
            Route::post('/{id}/report', [StoryController::class, 'report'])->where('id', '[0-9]+')->name('report');
            Route::get('/{id}/viewers', [StoryController::class, 'viewers'])->where('id', '[0-9]+')->name('viewers');

            /* Story analytics. `/react` above is kept as the canonical setter -
               it is what every shipped client already calls, and renaming it
               would break them - so `/reaction` adds only the two verbs that
               had no route at all: removing a reaction, and listing them. */
            Route::delete('/{id}/reaction',  [StoryController::class, 'removeReaction'])->where('id', '[0-9]+')->name('reaction.remove');
            Route::get('/{id}/reactions',    [StoryController::class, 'reactions'])->where('id', '[0-9]+')->name('reactions');
            Route::get('/{id}/analytics',    [StoryController::class, 'analytics'])->where('id', '[0-9]+')->name('analytics');
            Route::post('/{id}/share',       [StoryController::class, 'share'])->where('id', '[0-9]+')->name('share');
            Route::post('/{id}/repost',      [StoryController::class, 'repost'])->where('id', '[0-9]+')->name('repost');
            Route::get('/{id}',         [StoryController::class, 'show'])->where('id', '[0-9]+')->name('show');
            Route::delete('/{id}',      [StoryController::class, 'destroy'])->where('id', '[0-9]+')->name('destroy');
        });

        // Watch history widgets (summary, continue-watching, creators, settings)
        Route::prefix('history')->name('history.')->group(function () {
            Route::get('/',                     [WatchHistoryController::class, 'list'])->name('list');
            Route::get('/summary',              [WatchHistoryController::class, 'summary'])->name('summary');
            Route::get('/continue-watching',    [WatchHistoryController::class, 'continueWatching'])->name('continue-watching');
            Route::get('/creators',             [WatchHistoryController::class, 'creators'])->name('creators');
            Route::get('/settings',             [WatchHistoryController::class, 'getSettings'])->name('settings.get');
            Route::patch('/settings',           [WatchHistoryController::class, 'updateSettings'])->name('settings.update');
            Route::delete('/',                  [WatchHistoryController::class, 'clearAll'])->name('clear');
            Route::delete('/video/{videoId}',   [WatchHistoryController::class, 'removeVideo'])->where('videoId', '[0-9]+')->name('remove-video');
        });

        // Video event tracking (recommendation engine)
        Route::post('/video-events', [VideoEventController::class, 'store'])
            ->middleware('throttle:300,1')
            ->name('video-events.store');

        // Ad delivery beacon (signed impression/click/conversion). The signed
        // token IS the auth (it carries the viewer's user_id from serve time), so
        // the beacon works for guests too - the feed is public and guests see ads.
        Route::post('/ad-events', [AdEventController::class, 'store'])
            ->middleware('throttle:300,1')
            ->withoutMiddleware(['auth:sanctum', 'not.banned'])
            ->name('ad-events.store');

        // Single-slot sponsored ad for the Inbox "Messages" list (inbox placement).
        Route::get('/ads/inbox', [AdController::class, 'inbox'])
            ->middleware('throttle:60,1')
            ->name('ads.inbox');

        // POST /upload/content-check removed with the pre-publish content scan.
        Route::delete('/upload/cancel', [UploadCancelController::class, 'destroy'])
            ->name('upload.cancel');

        // Auth
        Route::prefix('auth')->name('auth.')->group(function () {
            Route::get('/me',                   [ApiAuthController::class, 'me'])->name('me');
            Route::post('/logout',              [ApiAuthController::class, 'logout'])->name('logout');
            Route::post('/logout-all',          [ApiAuthController::class, 'logoutAll'])->name('logout-all');
            Route::post('/change-password',     [ApiAuthController::class, 'changePassword'])->name('change-password');
            Route::post('/resend-verification', [ApiAuthController::class, 'resendVerification'])->name('resend-verification');
            // Establish the shared SSO cookie for a pre-existing Bearer session.
            Route::post('/sso/promote',         [\App\Http\Controllers\Api\Auth\SsoController::class, 'promote'])->middleware('throttle:20,1')->name('sso.promote');
            // Full-page authorization (consent) for a logged-in user.
            Route::get('/sso/grant-status',     [\App\Http\Controllers\Api\Auth\SsoController::class, 'grantStatus'])->name('sso.grant-status');
            Route::post('/sso/grant',           [\App\Http\Controllers\Api\Auth\SsoController::class, 'grant'])->middleware('throttle:20,1')->name('sso.grant');

            // ── QR-code login, phone side: scan the website's code, then
            //    approve or deny it - the public create/status half lives in
            //    this file's OTHER `auth` group, above (unauthenticated). ──
            Route::post('/qr/scan/{ticket}',    [\App\Http\Controllers\Api\Auth\QrLoginController::class, 'scan'])->middleware('throttle:qr-login-scan')->name('qr.scan');
            Route::post('/qr/confirm/{ticket}', [\App\Http\Controllers\Api\Auth\QrLoginController::class, 'confirm'])->middleware('throttle:qr-login-decide')->name('qr.confirm');
            Route::post('/qr/deny/{ticket}',    [\App\Http\Controllers\Api\Auth\QrLoginController::class, 'deny'])->middleware('throttle:qr-login-decide')->name('qr.deny');
        });

        // The "Add New Product" form - authenticated (creates/reuses the
        // caller's own Shop), unlike the public shops.* reads above.
        Route::post('/shop/products', [\App\Http\Controllers\Api\ShopController::class, 'storeProduct'])->name('shop.products.store');
        // Shop Settings > Products & Inventory - the seller's own list
        // (unfiltered by is_active) and the stock/visibility update the
        // create-only endpoint above never had a follow-up for.
        Route::get('/shop/products/mine',   [\App\Http\Controllers\Api\ShopController::class, 'myProducts'])->name('shop.products.mine');
        Route::patch('/shop/products/{id}', [\App\Http\Controllers\Api\ShopController::class, 'updateProduct'])->whereNumber('id')->name('shop.products.update');

        // Shop Settings > Products > Collections - CRUD; previously only a
        // demo seeder ever wrote a ProductCollection row.
        Route::prefix('shop/collections')->name('shop.collections.')->group(function () {
            Route::get('/',        [\App\Http\Controllers\Api\ShopCollectionController::class, 'index'])->name('index');
            Route::post('/',       [\App\Http\Controllers\Api\ShopCollectionController::class, 'store'])->name('store');
            Route::put('/{id}',    [\App\Http\Controllers\Api\ShopCollectionController::class, 'update'])->whereNumber('id')->name('update');
            Route::delete('/{id}', [\App\Http\Controllers\Api\ShopCollectionController::class, 'destroy'])->whereNumber('id')->name('destroy');
        });

        // Shop Settings > Products > Product Reviews - shop-wide reviews
        // (see ShopReview's own docblock), with a seller-reply path that
        // did not exist before.
        Route::get('/shop/reviews/mine',      [\App\Http\Controllers\Api\ShopController::class, 'sellerReviews'])->name('shop.reviews.mine');
        Route::put('/shop/reviews/{id}/reply',[\App\Http\Controllers\Api\ShopController::class, 'replyToReview'])->whereNumber('id')->name('shop.reviews.reply');

        // Reelsoo Shop checkout - real order + payment capture, mirroring
        // studio/wallets-coins' Stripe/Razorpay create->capture pattern. See
        // ShopOrderController's own docblock.
        Route::prefix('shop/orders')->name('shop.orders.')->group(function () {
            Route::get('/',      [\App\Http\Controllers\Api\ShopOrderController::class, 'myOrders'])->name('index');
            Route::get('/{id}',  [\App\Http\Controllers\Api\ShopOrderController::class, 'show'])->whereNumber('id')->name('show');
            Route::post('/stripe/intent',    [\App\Http\Controllers\Api\ShopOrderController::class, 'createStripeIntent'])->name('stripe.intent')->middleware('throttle:10,1');
            Route::post('/stripe/capture',   [\App\Http\Controllers\Api\ShopOrderController::class, 'captureStripePayment'])->name('stripe.capture')->middleware('throttle:10,1');
            Route::post('/razorpay/create',  [\App\Http\Controllers\Api\ShopOrderController::class, 'createRazorpayOrder'])->name('razorpay.create')->middleware('throttle:10,1');
            Route::post('/razorpay/capture', [\App\Http\Controllers\Api\ShopOrderController::class, 'captureRazorpayPayment'])->name('razorpay.capture')->middleware('throttle:10,1');
        });

        // Shop Settings > Selling > Orders & Returns - the SELLER's own view
        // of orders placed against their shop. Separate prefix from
        // shop/orders above (that group is entirely the BUYER's own
        // checkout/purchase-history surface) so the two can never be
        // confused by URL alone.
        Route::prefix('shop/seller/orders')->name('shop.seller.orders.')->group(function () {
            Route::get('/',              [\App\Http\Controllers\Api\ShopOrderController::class, 'sellerOrders'])->name('index');
            Route::get('/{id}',          [\App\Http\Controllers\Api\ShopOrderController::class, 'sellerOrderShow'])->whereNumber('id')->name('show');
            Route::patch('/{id}/status', [\App\Http\Controllers\Api\ShopOrderController::class, 'updateOrderStatus'])->whereNumber('id')->name('status');
        });

        // "Sell on Reelsoo" - the seller application/onboarding wizard.
        // Settings -> Sell on Reelsoo, NOT the public Shop screen above.
        Route::prefix('seller/application')->name('seller.application.')->group(function () {
            Route::get('/',                [\App\Http\Controllers\Api\SellerApplicationController::class, 'show'])->name('show');
            Route::put('/',                [\App\Http\Controllers\Api\SellerApplicationController::class, 'update'])->name('update');
            Route::post('/logo',           [\App\Http\Controllers\Api\SellerApplicationController::class, 'uploadLogo'])->name('logo');
            Route::post('/documents',      [\App\Http\Controllers\Api\SellerApplicationController::class, 'uploadDocument'])->middleware('throttle:20,60')->name('documents.store');
            Route::delete('/documents/{id}', [\App\Http\Controllers\Api\SellerApplicationController::class, 'destroyDocument'])->whereNumber('id')->name('documents.destroy');
            // Business applications need more required fields/documents than
            // individual ones, so a real applicant iterating on "missing
            // fields" errors can burn through a low budget fast - each of
            // those still counts as an attempt since throttle runs before
            // the controller. 20/hour keeps abuse-prevention while giving
            // that real workflow enough room.
            Route::post('/submit',         [\App\Http\Controllers\Api\SellerApplicationController::class, 'submit'])->middleware('throttle:20,60')->name('submit');
        });

        // Shop Settings - editing an ALREADY-APPROVED shop's storefront
        // fields. Separate from seller/application above on purpose: that
        // one is onboarding-only and refuses writes once approved; this one
        // refuses writes until approved. See ShopSettingsController's own
        // docblock.
        Route::prefix('shop/settings')->name('shop.settings.')->group(function () {
            Route::get('/',      [\App\Http\Controllers\Api\ShopSettingsController::class, 'show'])->name('show');
            Route::put('/',      [\App\Http\Controllers\Api\ShopSettingsController::class, 'update'])->name('update');
            Route::post('/logo', [\App\Http\Controllers\Api\ShopSettingsController::class, 'uploadLogo'])->name('logo');
            // Shop Operations > Pause Shop
            Route::post('/pause',  [\App\Http\Controllers\Api\ShopSettingsController::class, 'pause'])->name('pause');
            Route::post('/resume', [\App\Http\Controllers\Api\ShopSettingsController::class, 'resume'])->name('resume');
            // Customer Experience > Notifications
            Route::get('/notifications', [\App\Http\Controllers\Api\ShopSettingsController::class, 'notificationPreferences'])->name('notifications.show');
            Route::put('/notifications', [\App\Http\Controllers\Api\ShopSettingsController::class, 'updateNotificationPreferences'])->name('notifications.update');
        });

        // Profile
        Route::prefix('profile')->name('profile.')->group(function () {
            Route::get('/',                        [ProfileController::class, 'show'])->name('show');
            Route::get('/views',                   [ProfileController::class, 'profileViews'])->name('views');
            Route::put('/',                        [ProfileController::class, 'update'])->name('update');
            Route::post('/avatar',                 [ProfileController::class, 'updateAvatar'])->name('avatar');
            Route::delete('/avatar',               [ProfileController::class, 'removeAvatar'])->name('avatar.remove');
            Route::post('/check-username',         [ProfileController::class, 'checkUsername'])->middleware('throttle:username-check')->name('check-username');
            // Social-signup profile completion (birthday, name, username).
            // Deliberately its own limiter: a legitimate run through the flow is
            // one call, and it must not share a counter with anything else.
            Route::post('/complete-onboarding',    [ProfileController::class, 'completeSocialOnboarding'])->middleware('throttle:username-check')->name('complete-onboarding');
            Route::get('/social-links',            [ProfileController::class, 'socialLinks'])->name('social-links');
            Route::put('/social-links',            [ProfileController::class, 'updateSocialLinks'])->name('social-links.update');
            Route::get('/highlights',              [ProfileController::class, 'highlights'])->name('highlights');
            Route::post('/highlights',             [ProfileController::class, 'storeHighlight'])->name('highlights.store');
            Route::put('/highlights/{id}',         [ProfileController::class, 'updateHighlight'])->name('highlights.update');
            Route::delete('/highlights/{id}',      [ProfileController::class, 'destroyHighlight'])->name('highlights.destroy');
            Route::patch('/saved-privacy',         [ProfileController::class, 'updateSavedPrivacy'])->name('saved-privacy');
            Route::get('/hidden-story-users',      [ProfileController::class, 'getHiddenStoryUsers'])->name('hidden-story-users.get');
            Route::put('/hidden-story-users',      [ProfileController::class, 'updateHiddenStoryUsers'])->name('hidden-story-users.update');
            Route::get('/close-friends',           [ProfileController::class, 'getCloseFriends'])->name('close-friends.get');
            Route::put('/close-friends',           [ProfileController::class, 'updateCloseFriends'])->name('close-friends.update');
            Route::get('/privacy',                 [ProfileController::class, 'getPrivacySettings'])->name('privacy.get');
            Route::patch('/privacy',               [ProfileController::class, 'updatePrivacySettings'])->name('privacy.update');
            Route::get('/notifications',           [ProfileController::class, 'getNotifications'])->name('notifications.get');
            Route::patch('/notifications',         [ProfileController::class, 'updateNotifications'])->name('notifications.update');
            Route::get('/content-preferences',     [ProfileController::class, 'getContentPreferences'])->name('content-preferences.get');
            Route::patch('/content-preferences',   [ProfileController::class, 'updateContentPreferences'])->name('content-preferences.update');
            // Keyword / Hashtag / Not-Interested blocklists (Content Preferences popups)
            Route::get('/hidden-words',            [HiddenWordController::class, 'index'])->name('hidden-words.index');
            Route::post('/hidden-words',           [HiddenWordController::class, 'store'])->name('hidden-words.store');
            Route::delete('/hidden-words/{id}',    [HiddenWordController::class, 'destroy'])->whereNumber('id')->name('hidden-words.destroy');
            Route::get('/accessibility',           [ProfileController::class, 'getAccessibility'])->name('accessibility.get');
            Route::patch('/accessibility',         [ProfileController::class, 'updateAccessibility'])->name('accessibility.update');
            Route::get('/appearance',              [ProfileController::class, 'getAppearance'])->name('appearance.get');
            Route::patch('/appearance',            [ProfileController::class, 'updateAppearance'])->name('appearance.update');
            Route::get('/messages-preferences',    [ProfileController::class, 'getMessagesPreferences'])->name('messages-preferences.get');
            Route::patch('/messages-preferences',  [ProfileController::class, 'updateMessagesPreferences'])->name('messages-preferences.update');
            Route::get('/wellbeing',               [ProfileController::class, 'getWellbeing'])->name('wellbeing.get');
            Route::patch('/wellbeing',             [ProfileController::class, 'updateWellbeing'])->name('wellbeing.update');
            Route::get('/ai-preferences',          [ProfileController::class, 'getAiPreferences'])->name('ai-preferences.get');
            Route::patch('/ai-preferences',        [ProfileController::class, 'updateAiPreferences'])->name('ai-preferences.update');
            Route::get('/spaces-preferences',      [ProfileController::class, 'getSpacesPreferences'])->name('spaces-preferences.get');
            Route::patch('/spaces-preferences',    [ProfileController::class, 'updateSpacesPreferences'])->name('spaces-preferences.update');
            Route::get('/family',                  [ProfileController::class, 'getFamily'])->name('family.get');
            Route::patch('/family',                [ProfileController::class, 'updateFamily'])->name('family.update');
            Route::get('/upload-preferences',      [ProfileController::class, 'getUploadPreferences'])->name('upload-preferences.get');
            Route::patch('/upload-preferences',    [ProfileController::class, 'updateUploadPreferences'])->name('upload-preferences.update');
            Route::post('/family/pin',             [ProfileController::class, 'setFamilyPin'])->middleware('throttle:10,1')->name('family.pin.set');
            Route::post('/family/pin/verify',      [ProfileController::class, 'verifyFamilyPin'])->middleware('throttle:10,1')->name('family.pin.verify');
        });

        // Location (regional geocoding - Account Settings only)
        Route::prefix('location')->name('location.')->group(function () {
            Route::get('/search',          [LocationController::class, 'search'])->name('search')->middleware('throttle:60,1');
            Route::post('/reverse-geocode',[LocationController::class, 'reverseGeocode'])->name('reverse-geocode')->middleware('throttle:30,1');
            Route::post('/save',           [LocationController::class, 'save'])->name('save');
            Route::get('/me',              [LocationController::class, 'me'])->name('me');
        });

        // Account
        Route::prefix('account')->name('account.')->group(function () {
            Route::get('/status',            [AccountController::class, 'status'])->name('status');
            Route::get('/restrictions',      [AccountController::class, 'restrictions'])->name('restrictions');
            Route::post('/change-email',     [AccountController::class, 'changeEmail'])->middleware('throttle:5,1')->name('change-email');
            Route::post('/change-phone',     [AccountController::class, 'changePhone'])->middleware('throttle:5,1')->name('change-phone');
            Route::post('/send-email-otp',   [AccountController::class, 'sendEmailOtp'])->middleware('throttle:5,1')->name('send-email-otp');
            Route::post('/verify-email-otp', [AccountController::class, 'verifyEmailOtp'])->middleware('throttle:10,1')->name('verify-email-otp');
            Route::get('/export',            [AccountController::class, 'export'])->middleware('throttle:3,1')->name('export');
            Route::get('/security',          [AccountController::class, 'security'])->name('security');
            Route::get('/sessions',          [AccountController::class, 'sessions'])->name('sessions');
            Route::delete('/sessions/{id}',  [AccountController::class, 'revokeSession'])->name('sessions.revoke');
            Route::delete('/sessions',       [AccountController::class, 'revokeAllSessions'])->name('sessions.revoke-all');
            Route::patch('/login-alerts',    [AccountController::class, 'toggleLoginAlerts'])->name('login-alerts');
            Route::get('/social-accounts',              [AccountController::class, 'socialAccounts'])->name('social-accounts');
            Route::delete('/social-accounts/{provider}',[AccountController::class, 'unlinkSocialAccount'])->name('social-accounts.unlink');
            Route::get('/authorized-apps',              [AccountController::class, 'authorizedApps'])->name('authorized-apps');
            Route::post('/delete',           [AccountController::class, 'deleteAccount'])->middleware('throttle:3,1')->name('delete');
        });

        // Screen Time (Digital Wellbeing) - active in-app usage tracking.
        Route::prefix('screen-time')->name('screen-time.')->group(function () {
            Route::post('/heartbeat',      [ScreenTimeController::class, 'heartbeat'])->middleware('throttle:120,1')->name('heartbeat');
            Route::get('/today',           [ScreenTimeController::class, 'today'])->name('today');
            Route::get('/summary',         [ScreenTimeController::class, 'summary'])->name('summary');
            Route::get('/graph',           [ScreenTimeController::class, 'graph'])->name('graph');
            Route::get('/limits',          [ScreenTimeController::class, 'limits'])->name('limits.get');
            Route::patch('/limits',        [ScreenTimeController::class, 'updateLimits'])->name('limits.update');
            Route::get('/reports/weekly',  [ScreenTimeController::class, 'weekly'])->name('reports.weekly');
            Route::get('/reports/monthly', [ScreenTimeController::class, 'monthly'])->name('reports.monthly');
        });

        // Realtime (Centrifugo) - mint the connection + subscription JWTs clients
        // need to connect and subscribe to private channels. Additive to Sanctum.
        Route::prefix('realtime')->name('realtime.')->group(function () {
            Route::get('/token',      [RealtimeController::class, 'token'])->name('token');
            Route::post('/subscribe', [RealtimeController::class, 'subscribe'])->middleware('throttle:120,1')->name('subscribe');
        });

        // Presence - privacy-filtered online lookup (Centrifugo replacement for the
        // chat-server's presence:get ack). Reached by the mobile client under the
        // centrifugo driver.
        Route::post('/presence', [PresenceController::class, 'index'])->middleware('throttle:120,1')->name('presence');

        // Inside a Space. The seat (join/leave/request-speak) and the mic path.
        // rtc/token mints a LiveKit participant JWT (StreamHub, self-hosted) -
        // the audio itself flows app <-> our own LiveKit cluster and never
        // through this server, so this route never carries media itself.
        // Hosting. Creating is throttled: a room is a push to your followers'
        // attention, not a cheap write.
        Route::post('/spaces', [\App\Http\Controllers\Api\SpaceCreateController::class, 'store'])
            ->middleware('throttle:10,1')->name('spaces.store');

        Route::prefix('spaces/{space}')->name('spaces.')->whereNumber('space')->group(function () {
            Route::post('/end',           [\App\Http\Controllers\Api\SpaceCreateController::class, 'end'])->name('end');
            Route::post('/invite',        [\App\Http\Controllers\Api\SpaceCreateController::class, 'invite'])
                ->middleware('throttle:20,1')->name('invite');
            // "Remind me" on a scheduled room - the RSVP behind its "N going".
            Route::post('/remind',        [\App\Http\Controllers\Api\SpaceReminderController::class, 'toggle'])->name('remind');
            Route::post('/join',          [\App\Http\Controllers\Api\SpaceRoomController::class, 'join'])->name('join');
            Route::post('/leave',         [\App\Http\Controllers\Api\SpaceRoomController::class, 'leave'])->name('leave');
            Route::post('/report',        [\App\Http\Controllers\Api\SpaceRoomController::class, 'report'])
                ->middleware('throttle:30,1')->name('report');
            Route::post('/request-speak', [\App\Http\Controllers\Api\SpaceRoomController::class, 'requestSpeak'])
                ->middleware('throttle:10,1')->name('request-speak');
            Route::post('/cancel-request', [\App\Http\Controllers\Api\SpaceRoomController::class, 'cancelRequest'])->name('cancel-request');
            // The React button - a counter, tapped fast, so it gets its own head-room.
            Route::post('/heart',         [\App\Http\Controllers\Api\SpaceRoomController::class, 'heart'])
                ->middleware('throttle:120,1')->name('heart');

            // The host's raise-hand queue.
            Route::get('/requests',                  [\App\Http\Controllers\Api\SpaceRequestController::class, 'index'])->name('requests.index');
            Route::post('/requests/{user}/approve',  [\App\Http\Controllers\Api\SpaceRequestController::class, 'approve'])->whereNumber('user')->name('requests.approve');
            Route::post('/requests/{user}/decline',  [\App\Http\Controllers\Api\SpaceRequestController::class, 'decline'])->whereNumber('user')->name('requests.decline');

            // Moderation - host & moderators run the room (authority enforced in the
            // controller: audience actions = host+mods, moderator management = host).
            Route::prefix('moderation/{user}')->whereNumber('user')->name('moderation.')->group(function () {
                Route::post('/promote',           [\App\Http\Controllers\Api\SpaceModerationController::class, 'promote'])->name('promote');
                Route::post('/demote',            [\App\Http\Controllers\Api\SpaceModerationController::class, 'demote'])->name('demote');
                Route::post('/mute',              [\App\Http\Controllers\Api\SpaceModerationController::class, 'mute'])->name('mute');
                Route::post('/remove',            [\App\Http\Controllers\Api\SpaceModerationController::class, 'remove'])->name('remove');
                Route::post('/block',             [\App\Http\Controllers\Api\SpaceModerationController::class, 'block'])->name('block');
                Route::post('/promote-moderator', [\App\Http\Controllers\Api\SpaceModerationController::class, 'addModerator'])->name('add-mod');
                Route::post('/remove-moderator',  [\App\Http\Controllers\Api\SpaceModerationController::class, 'removeModerator'])->name('remove-mod');
            });

            // In-room chat (reading is public, above; these are the writes).
            Route::post('/messages',                    [\App\Http\Controllers\Api\SpaceChatController::class, 'store'])->middleware('throttle:60,1')->name('messages.store');
            Route::post('/messages/{message}/react',    [\App\Http\Controllers\Api\SpaceChatController::class, 'react'])->whereNumber('message')->middleware('throttle:120,1')->name('messages.react');
            Route::post('/messages/{message}/pin',      [\App\Http\Controllers\Api\SpaceChatController::class, 'pin'])->whereNumber('message')->name('messages.pin');

            Route::post('/rtc/token',       [\App\Http\Controllers\Api\SpaceRtcController::class, 'token'])->middleware('throttle:30,1')->name('rtc.token');
            Route::post('/rtc/mute',        [\App\Http\Controllers\Api\SpaceRtcController::class, 'mute'])->middleware('throttle:60,1')->name('rtc.mute');
        });

        // Hashtag Challenges - the one authed action, the "Join" tap (an
        // RSVP toggle, same shape as spaces/{space}/remind above).
        Route::post('/challenges/{challenge}/join', [ChallengeController::class, 'join'])
            ->whereNumber('challenge')->name('challenges.join');

        // Calls - 1:1 audio/video signalling (Centrifugo replacement for the
        // chat-server call:* handlers). Ephemeral state in Redis, events via RealtimeBus.
        Route::prefix('calls')->name('calls.')->group(function () {
            Route::post('/',            [CallController::class, 'initiate'])->middleware('throttle:30,1')->name('initiate');
            Route::post('/{id}/accept', [CallController::class, 'accept'])->name('accept');
            Route::post('/{id}/reject', [CallController::class, 'reject'])->name('reject');
            Route::post('/{id}/end',    [CallController::class, 'end'])->name('end');
            Route::post('/{id}/signal', [CallController::class, 'signal'])->middleware('throttle:600,1')->name('signal');
        });

        // Users
        Route::prefix('users')->name('users.')->group(function () {
            Route::get('/search',               [UserController::class, 'search'])->name('search');
            Route::get('/suggestions',          [UserController::class, 'suggestions'])->name('suggestions');
            Route::get('/blocked',              [BlockController::class, 'index'])->name('blocked');
            Route::get('/muted',                [\App\Http\Controllers\Api\MuteController::class, 'index'])->name('muted');
            // Follow requests (incoming pending follow requests for this user)
            Route::get('/follow-requests',                      [FollowController::class, 'followRequests'])->name('follow-requests');
            Route::post('/follow-requests/{id}/accept',         [FollowController::class, 'acceptFollowRequest'])->where('id', '[0-9]+')->name('follow-requests.accept');
            Route::post('/follow-requests/{id}/decline',        [FollowController::class, 'declineFollowRequest'])->where('id', '[0-9]+')->name('follow-requests.decline');
            // Tag requests ("Tag people" approval - see TagController)
            Route::post('/tag-requests/{id}/accept',            [TagController::class, 'accept'])->where('id', '[0-9]+')->name('tag-requests.accept');
            Route::post('/tag-requests/{id}/decline',           [TagController::class, 'decline'])->where('id', '[0-9]+')->name('tag-requests.decline');
            // Collab requests ("Paid partnership" approval - see CollabController)
            Route::post('/collab-requests/{id}/accept',         [CollabController::class, 'accept'])->where('id', '[0-9]+')->name('collab-requests.accept');
            Route::post('/collab-requests/{id}/decline',        [CollabController::class, 'decline'])->where('id', '[0-9]+')->name('collab-requests.decline');
            Route::get('/{username}/liked',     [UserController::class, 'liked'])->name('liked');
            Route::get('/{username}/saved',     [UserController::class, 'saved'])->name('saved');
            Route::get('/{username}/saved/count', [UserController::class, 'savedCount'])->name('saved.count');
            // Followers/following lists require login - public profile only exposes counts
            Route::get('/{username}/followers', [UserController::class, 'followers'])->name('followers');
            Route::get('/{username}/following', [UserController::class, 'following'])->name('following');
            Route::post('/{username}/follow',   [FollowController::class, 'follow'])->middleware('throttle:follow-action')->name('follow');
            Route::delete('/{username}/follow', [FollowController::class, 'unfollow'])->name('unfollow');
            Route::put('/{username}/follow/notify', [FollowController::class, 'toggleNotify'])->name('follow.notify');
            Route::post('/{username}/block',    [BlockController::class, 'block'])->name('block');
            Route::delete('/{username}/block',  [BlockController::class, 'unblock'])->name('unblock');
            Route::post('/{username}/report',   [BlockController::class, 'report'])->middleware('throttle:30,1')->name('report');
            Route::post('/{username}/mute',     [\App\Http\Controllers\Api\MuteController::class, 'mute'])->name('mute');
            Route::delete('/{username}/mute',   [\App\Http\Controllers\Api\MuteController::class, 'unmute'])->name('unmute');
        });

        // ── Friends tab ───────────────────────────────────────────────────────
        // "What friends are doing": videos, stories and live Spaces from the
        // people you follow, read straight from those tables (no activity log).
        Route::get('/friends/activity', [\App\Http\Controllers\Api\FriendsActivityController::class, 'index'])
            ->middleware('throttle:60,1')->name('friends.activity');

        // ── Profile suggestions ───────────────────────────────────────────────
        Route::prefix('suggestions')->name('suggestions.')->middleware('throttle:60,1')->group(function () {
            Route::get('/profiles',                            [SuggestionController::class, 'profiles'])->name('profiles');
            Route::post('/profiles/{userId}/dismiss',          [SuggestionController::class, 'dismiss'])->where('userId', '[0-9]+')->name('dismiss');
            Route::post('/profiles/{userId}/followed',         [SuggestionController::class, 'markFollowed'])->where('userId', '[0-9]+')->name('followed');
            Route::delete('/cache',                            [SuggestionController::class, 'clearCache'])->name('cache.clear');
            Route::get('/analytics',                           [SuggestionController::class, 'analytics'])->name('analytics');
        });

        // ── Video upload routes - separate from interaction throttle ──────────
        // throttle:N,M,prefix  →  cache key = prefix + sha1(userId)
        // Each prefix is unique so counters never bleed into each other.
        // 200/day for presigning (covers retries), 20/day for actual completions.
        // No per-minute cap - users can upload all 20 back-to-back any time.
        Route::prefix('videos')->name('videos.')->group(function () {
            // Music recognition result from the device (ShazamKit runs on the
            // phone; there is no server-side Shazam API). Owner-only, and
            // idempotent - a retry after a dropped response returns the existing
            // attribution rather than writing again. Named limiter, not a
            // numeric one: on an authenticated route those key on the user id
            // alone and share one counter with every other inline-throttled
            // endpoint, which is what broke QR approval and the admin panel.
            Route::post('/{video}/recognition',        [VideoMusicRecognitionController::class, 'store'])
                ->middleware('throttle:music-recognition')->name('recognition.store');
            Route::delete('/{video}/recognition',      [VideoMusicRecognitionController::class, 'clear'])
                ->middleware('throttle:music-recognition')->name('recognition.clear');

            Route::post('/',                [VideoController::class, 'store'])
                ->name('store')
                ->middleware('throttle:20,1440,vidpub');
            Route::post('/upload-url',      [VideoController::class, 'uploadUrl'])
                ->name('upload-url')
                ->middleware('throttle:200,1440,vidsign');
            Route::post('/thumbnail-url',   [VideoController::class, 'thumbnailUploadUrl'])
                ->name('thumbnail-url')
                ->middleware('throttle:200,1440,thumbsign');
            Route::post('/complete-upload', [VideoController::class, 'completeUpload'])
                ->name('complete-upload')
                ->middleware('throttle:20,1440,vidpub');

            // Multipart / resumable uploads. The per-part sign endpoint gets a
            // far higher ceiling than the others on purpose: one 500 MB video is
            // ~60 parts, and a flaky connection re-signs some of them, so the
            // 200/day that suits a single-shot presign would cut a normal user
            // off after three uploads.
            Route::prefix('upload/multipart')->name('multipart.')->group(function () {
                Route::post('/create',   [MultipartUploadController::class, 'create'])
                    ->name('create')->middleware('throttle:200,1440,mpcreate');
                Route::post('/sign',     [MultipartUploadController::class, 'sign'])
                    ->name('sign')->middleware('throttle:20000,1440,mpsign');
                Route::get('/status',    [MultipartUploadController::class, 'status'])
                    ->name('status')->middleware('throttle:600,1440,mpstatus');
                Route::post('/complete', [MultipartUploadController::class, 'complete'])
                    ->name('complete')->middleware('throttle:200,1440,mpcomplete');
                Route::post('/abort',    [MultipartUploadController::class, 'abort'])
                    ->name('abort')->middleware('throttle:200,1440,mpabort');
            });
        });

        // ── Video interactions - 300/min per user (was 120, raised to handle heavy use) ──
        Route::prefix('videos')->name('videos.')->middleware('throttle:300,1')->group(function () {
            Route::get('/following', [VideoController::class, 'followingFeed'])->name('following');
            Route::put('/{id}',          [VideoController::class, 'update'])->name('update');
            Route::patch('/{id}/privacy',[VideoController::class, 'updatePrivacy'])->where('id', '[0-9]+')->name('privacy');
            Route::delete('/{id}',       [VideoController::class, 'destroy'])->name('destroy');

            Route::post('/{id}/like',              [VideoInteractionController::class, 'like'])->middleware('throttle:like-action')->name('like');
            Route::delete('/{id}/like',            [VideoInteractionController::class, 'unlike'])->name('unlike');
            Route::post('/{id}/toggle-like',       [VideoInteractionController::class, 'toggleLike'])->middleware('throttle:like-action')->name('toggle-like');
            Route::post('/{id}/save',              [VideoInteractionController::class, 'save'])->name('save');
            Route::delete('/{id}/save',            [VideoInteractionController::class, 'unsave'])->name('unsave');
            Route::post('/{id}/toggle-save',       [VideoInteractionController::class, 'toggleSave'])->name('toggle-save');
            Route::post('/{id}/report',            [VideoInteractionController::class, 'report'])->name('report');
            Route::post('/{id}/not-interested',    [VideoInteractionController::class, 'notInterested'])->name('not-interested');
            Route::post('/{id}/not-interested-creator', [VideoInteractionController::class, 'dontRecommendCreator'])->name('not-interested-creator');
            Route::post('/{id}/pin',               [VideoController::class, 'pin'])->where('id', '[0-9]+')->name('pin');
            Route::post('/{id}/unpin',             [VideoController::class, 'unpin'])->where('id', '[0-9]+')->name('unpin');

            Route::post('/{id}/comments',          [CommentController::class, 'store'])->middleware('throttle:comment-create')->name('comments.store');
            Route::delete('/{id}/comments/{cid}',  [CommentController::class, 'destroy'])->name('comments.destroy');
            Route::post('/{id}/comments/{cid}/like',   [CommentController::class, 'like'])->name('comments.like');
            Route::delete('/{id}/comments/{cid}/like', [CommentController::class, 'unlike'])->name('comments.unlike');
        });

        // Advanced comment actions (keyed by comment ID directly)
        Route::prefix('comments')->name('comments.')->middleware('throttle:300,1')->group(function () {
            Route::post('/{id}/react',  [CommentController::class, 'react'])->where('id', '[0-9]+')->name('react');
            Route::put('/{id}',         [CommentController::class, 'edit'])->where('id', '[0-9]+')->name('edit');
            Route::delete('/{id}',      [CommentController::class, 'destroyById'])->where('id', '[0-9]+')->name('destroy-by-id');
            Route::post('/{id}/report', [CommentController::class, 'report'])->where('id', '[0-9]+')->name('report');
            Route::post('/{id}/pin',    [CommentController::class, 'pin'])->where('id', '[0-9]+')->name('pin');
            Route::post('/{id}/unpin',  [CommentController::class, 'unpin'])->where('id', '[0-9]+')->name('unpin');
        });

        // Notifications
        Route::prefix('notifications')->name('notifications.')->group(function () {
            Route::get('/',              [NotificationController::class, 'index'])->name('index');
            Route::get('/unread-count',  [NotificationController::class, 'unreadCount'])->name('unread-count');
            Route::get('/{id}/actors',   [NotificationController::class, 'actors'])->where('id', '[0-9]+')->name('actors');
            Route::post('/{id}/read',    [NotificationController::class, 'markRead'])->name('mark-read');
            Route::post('/read-many',    [NotificationController::class, 'markManyRead'])->name('mark-many-read');
            Route::post('/read-all',     [NotificationController::class, 'markAllRead'])->name('mark-all-read');
            Route::delete('/{id}',       [NotificationController::class, 'destroy'])->name('destroy');
        });

        // Direct Messages
        Route::prefix('messages')->name('messages.')->group(function () {
            Route::get('/unread-count',                    [MessageController::class, 'unreadCount'])->name('unread-count');
            Route::post('/upload-url',                     [MessageController::class, 'uploadUrl'])->name('upload-url');
            Route::get('/conversations',                   [MessageController::class, 'conversations'])->name('conversations');
            Route::get('/share-suggestions',               [MessageController::class, 'shareSuggestions'])->name('share-suggestions');
            Route::get('/conversations/{userId}',          [MessageController::class, 'history'])->where('userId', '[0-9]+')->name('history');
            Route::post('/conversations/{userId}',         [MessageController::class, 'send'])->where('userId', '[0-9]+')->middleware('throttle:message-send')->name('send');
            Route::post('/conversations/{userId}/read',    [MessageController::class, 'markRead'])->where('userId', '[0-9]+')->name('mark-read');
            Route::post('/conversations/{userId}/typing',  [MessageController::class, 'typing'])->where('userId', '[0-9]+')->middleware('throttle:30,1')->name('typing');
            Route::put('/conversations/{userId}/settings', [MessageController::class, 'updateConversationSettings'])->where('userId', '[0-9]+')->name('settings.update');
            Route::post('/conversations/{userId}/report',  [MessageController::class, 'report'])->where('userId', '[0-9]+')->middleware('throttle:30,1')->name('conversations.report');
            Route::post('/delivered',                      [MessageController::class, 'markDelivered'])->name('delivered');
            // Message requests inbox
            Route::get('/requests',                        [MessageController::class, 'requests'])->name('requests');
            Route::post('/requests/{id}/accept',           [MessageController::class, 'acceptRequest'])->where('id', '[0-9]+')->name('requests.accept');
            Route::post('/requests/{id}/cancel',           [MessageController::class, 'cancelRequest'])->where('id', '[0-9]+')->name('requests.cancel');
            Route::post('/requests/{id}/delete',           [MessageController::class, 'deleteRequest'])->where('id', '[0-9]+')->name('requests.delete');
            Route::post('/requests/{id}/block',            [MessageController::class, 'blockRequest'])->where('id', '[0-9]+')->name('requests.block');
            Route::post('/requests/{id}/report',           [MessageController::class, 'reportRequest'])->where('id', '[0-9]+')->name('requests.report');
            // Message actions
            Route::patch('/{id}',                [MessageController::class, 'editMessage'])->where('id', '[0-9]+')->name('edit');
            Route::delete('/{id}',               [MessageController::class, 'deleteMessage'])->where('id', '[0-9]+')->name('delete');
            Route::post('/{id}/pin',             [MessageController::class, 'pinMessage'])->where('id', '[0-9]+')->name('pin');
            Route::post('/{id}/unpin',           [MessageController::class, 'unpinMessage'])->where('id', '[0-9]+')->name('unpin');
            Route::post('/{id}/forward',         [MessageController::class, 'forwardMessage'])->where('id', '[0-9]+')->name('forward');
            Route::post('/{id}/react',           [MessageController::class, 'reactMessage'])->where('id', '[0-9]+')->name('react');
            Route::delete('/{id}/react',         [MessageController::class, 'unreactMessage'])->where('id', '[0-9]+')->name('unreact');
        });

        // Creator Studio
        Route::prefix('studio')->name('studio.')->group(function () {
            Route::get('/permissions',                 [StudioDashboardController::class, 'permissions'])->name('permissions');
            Route::get('/creator-level-page',          [StudioDashboardController::class, 'creatorLevelPage'])->name('creator-level-page');
            Route::get('/become-creator',              [CreatorEligibilityController::class, 'eligibility'])->name('become-creator');
            Route::post('/become-creator/accept-terms',[CreatorEligibilityController::class, 'acceptTerms'])->name('become-creator.accept-terms');
            Route::post('/become-creator/apply',       [CreatorEligibilityController::class, 'apply'])->name('become-creator.apply');
            Route::get('/dashboard',    [StudioDashboardController::class, 'index'])->name('dashboard');

            /* ── The broadcaster's own live controls ─────────────────────
               Scoped in the controller to a stream the caller hosts or was
               promoted to moderate. Appointing further moderators is host-only. */
            Route::prefix('live')->name('live.')->group(function () {
                Route::get('/',                       [StudioLiveController::class, 'index'])->name('index');
                Route::post('/',                      [StudioLiveController::class, 'store'])->name('store');
                Route::patch('/{id}',                 [StudioLiveController::class, 'update'])->whereNumber('id')->name('update');
                Route::post('/{id}/start',            [StudioLiveController::class, 'start'])->whereNumber('id')->name('start');
                Route::post('/{id}/end',              [StudioLiveController::class, 'end'])->whereNumber('id')->name('end');
                Route::post('/{id}/rotate-key',       [StudioLiveController::class, 'rotateKey'])->whereNumber('id')->name('rotate-key');
                Route::post('/{id}/moderators',       [StudioLiveController::class, 'addModerator'])->whereNumber('id')->name('moderators.add');
                Route::delete('/{id}/moderators/{userId}', [StudioLiveController::class, 'removeModerator'])->whereNumber('id')->whereNumber('userId')->name('moderators.remove');
                Route::post('/{id}/bans',             [StudioLiveController::class, 'banViewer'])->whereNumber('id')->name('bans.add');
                Route::delete('/{id}/bans/{userId}',  [StudioLiveController::class, 'unbanViewer'])->whereNumber('id')->whereNumber('userId')->name('bans.remove');
                Route::delete('/{id}/messages/{messageId}', [StudioLiveController::class, 'removeMessage'])->whereNumber('id')->whereNumber('messageId')->name('messages.remove');
                Route::post('/{id}/messages/{messageId}/pin', [StudioLiveController::class, 'pinMessage'])->whereNumber('id')->whereNumber('messageId')->name('messages.pin');
            });
            Route::get('/analytics',           [StudioAnalyticsController::class, 'index'])->name('analytics');
            Route::get('/analytics/overview',  [StudioAnalyticsController::class, 'overview'])->name('analytics.overview');
            Route::get('/analytics/best-time', [StudioAnalyticsController::class, 'bestTimeToPost'])->name('analytics.best-time');
            // ClickHouse-backed dashboard for the web Studio. Deliberately a separate
            // endpoint from analytics/overview above, which the shipped mobile app
            // consumes - changing that payload's shape underneath it would break it.
            Route::get('/analytics/dashboard', [StudioDashboardAnalyticsController::class, 'dashboard'])->name('analytics.dashboard');
            Route::get('/content',                       [StudioContentController::class, 'index'])->name('content');
            Route::get('/content/{id}/insights',         [StudioInsightsController::class, 'show'])->name('content.insights');
            Route::post('/content/bulk',               [StudioContentController::class, 'bulk'])->name('content.bulk');
            Route::delete('/content/{id}',             [StudioContentController::class, 'destroy'])->name('content.destroy');
            Route::patch('/content/{id}',              [StudioContentController::class, 'updateFull'])->name('content.update');
            Route::patch('/content/{id}/status',       [StudioContentController::class, 'updateStatus'])->name('content.status');
            Route::patch('/content/{id}/reschedule',   [StudioContentController::class, 'reschedule'])->name('content.reschedule');
            Route::post('/content/{id}/duplicate',     [StudioContentController::class, 'duplicate'])->name('content.duplicate');
            Route::post('/content/{id}/thumbnail',     [StudioContentController::class, 'updateThumbnail'])->name('content.thumbnail');

            // ── Comments inbox (creator comment management) ──────────────
            Route::prefix('comments')->name('comments.')->group(function () {
                Route::get('/',                 [StudioCommentController::class, 'index'])->name('index');
                Route::get('/stats',            [StudioCommentController::class, 'stats'])->name('stats');
                Route::get('/contents',         [StudioCommentController::class, 'contents'])->name('contents');
                Route::post('/read-all',        [StudioCommentController::class, 'markAllSeen'])->name('read-all');
                Route::post('/bulk',            [StudioCommentController::class, 'bulk'])->name('bulk');
                Route::get('/{id}/thread',      [StudioCommentController::class, 'thread'])->where('id', '[0-9]+')->name('thread');
                Route::post('/{id}/reply',      [StudioCommentController::class, 'reply'])->where('id', '[0-9]+')->name('reply');
                Route::post('/{id}/seen',       [StudioCommentController::class, 'markSeen'])->where('id', '[0-9]+')->name('seen');
                Route::post('/{id}/pin',        [StudioCommentController::class, 'pin'])->where('id', '[0-9]+')->name('pin');
                Route::post('/{id}/unpin',      [StudioCommentController::class, 'unpin'])->where('id', '[0-9]+')->name('unpin');
                Route::post('/{id}/hide',       [StudioCommentController::class, 'hide'])->where('id', '[0-9]+')->name('hide');
                Route::post('/{id}/unhide',     [StudioCommentController::class, 'unhide'])->where('id', '[0-9]+')->name('unhide');
                Route::post('/{id}/spam',       [StudioCommentController::class, 'spam'])->where('id', '[0-9]+')->name('spam');
                Route::post('/{id}/unspam',     [StudioCommentController::class, 'unspam'])->where('id', '[0-9]+')->name('unspam');
                Route::post('/{id}/hold',       [StudioCommentController::class, 'hold'])->where('id', '[0-9]+')->name('hold');
                Route::post('/{id}/unhold',     [StudioCommentController::class, 'unhold'])->where('id', '[0-9]+')->name('unhold');
                Route::post('/{id}/restrict',   [StudioCommentController::class, 'restrict'])->where('id', '[0-9]+')->name('restrict');
                Route::post('/{id}/unrestrict', [StudioCommentController::class, 'unrestrict'])->where('id', '[0-9]+')->name('unrestrict');
                Route::post('/{id}/note',       [StudioCommentController::class, 'note'])->where('id', '[0-9]+')->name('note');
                Route::delete('/{id}',          [StudioCommentController::class, 'destroy'])->where('id', '[0-9]+')->name('destroy');
            });

            Route::get('/creator-level',[StudioDashboardController::class, 'creatorLevel'])->name('creator-level');
            Route::get('/creator-level/progress',[StudioDashboardController::class, 'trackProgress'])->name('creator-level.progress');
            Route::get('/monetization', [StudioDashboardController::class, 'monetization'])->name('monetization');

            // Creator tax forms (W-8BEN / W-9 / W-8BEN-E / Other). Per-user; each
            // creator only ever sees and manages their own submissions.
            Route::prefix('tax-forms')->name('tax-forms.')->group(function () {
                Route::get('/',        [TaxFormController::class, 'index'])->name('index');
                Route::post('/',       [TaxFormController::class, 'store'])->name('store')->middleware('throttle:10,60');
                Route::delete('/{id}', [TaxFormController::class, 'destroy'])->where('id', '[0-9]+')->name('destroy');
            });
            // Full monetization page endpoints
            Route::get('/monetization/overview',  [StudioMonetizationController::class, 'overview'])->name('monetization.overview');
            Route::put('/monetization/goal',       [StudioMonetizationController::class, 'updateGoal'])->name('monetization.goal');
            Route::get('/monetization/payout-methods', [StudioMonetizationController::class, 'payoutMethods'])->name('monetization.payout-methods');
            // Where a creator's payout accounts are actually created. Without
            // these the table was read-only, so a method added in the app never
            // reached the server and every screen reading it showed "none".
            Route::post('/monetization/payout-methods',                [StudioMonetizationController::class, 'storePayoutMethod'])->name('monetization.payout-methods.store');
            Route::patch('/monetization/payout-methods/{id}',          [StudioMonetizationController::class, 'updatePayoutMethod'])->whereNumber('id')->name('monetization.payout-methods.update');
            Route::post('/monetization/payout-methods/{id}/default',   [StudioMonetizationController::class, 'setDefaultPayoutMethod'])->whereNumber('id')->name('monetization.payout-methods.default');
            Route::delete('/monetization/payout-methods/{id}',         [StudioMonetizationController::class, 'destroyPayoutMethod'])->whereNumber('id')->name('monetization.payout-methods.destroy');
            // The admin-controlled programme list, with each requirement already
            // measured against this creator. Both clients render exactly this.
            // Terms a creator accepts to clear a requirement - the pledge, the
            // merchant agreement, the disclosure commitment.
            Route::get('/monetization/agreements',  [\App\Http\Controllers\Api\Studio\CreatorAgreementController::class, 'index'])->name('monetization.agreements.index');
            Route::post('/monetization/agreements', [\App\Http\Controllers\Api\Studio\CreatorAgreementController::class, 'store'])->name('monetization.agreements.store');
            Route::get('/monetization/programs', [\App\Http\Controllers\Api\Studio\StudioMonetizationProgramController::class, 'index'])->name('monetization.programs');
            Route::post('/monetization/programs/{key}/waitlist', [\App\Http\Controllers\Api\Studio\StudioMonetizationProgramController::class, 'joinWaitlist'])->name('monetization.programs.waitlist')->middleware('throttle:10,1');
            Route::post('/monetization/withdraw',  [StudioMonetizationController::class, 'requestWithdraw'])->name('monetization.withdraw')->middleware('throttle:3,60');

            // Promotions
            Route::prefix('promotions')->name('promotions.')->group(function () {
                Route::get('/',        [StudioPromotionController::class, 'index'])->name('index');
                Route::get('/overview', [StudioPromotionController::class, 'overview'])->name('overview');
                Route::post('/estimate', [StudioPromotionController::class, 'estimate'])->name('estimate');
                Route::post('/',       [StudioPromotionController::class, 'store'])->name('store');
                Route::get('/{id}',   [StudioPromotionController::class, 'show'])->name('show');
                Route::post('/{id}/toggle', [StudioPromotionController::class, 'toggle'])->name('toggle');
                Route::patch('/{id}', [StudioPromotionController::class, 'update'])->name('update');
                Route::delete('/{id}',[StudioPromotionController::class, 'destroy'])->name('destroy');
            });

            // Reelsoo Ads — advertiser API (Campaign -> Ad Group -> Creative). Additive; the
            // promotions endpoints above still work and bridge into these tables.
            Route::prefix('ad-campaigns')->name('ad-campaigns.')->group(function () {
                Route::get('/',             [StudioAdCampaignController::class, 'index'])->name('index');
                Route::post('/',            [StudioAdCampaignController::class, 'store'])->name('store');
                Route::post('/estimate',    [StudioAdCampaignController::class, 'estimate'])->name('estimate');
                Route::get('/{id}',          [StudioAdCampaignController::class, 'show'])->name('show');
                Route::get('/{id}/insights', [StudioAdInsightsController::class, 'campaign'])->name('insights');
                Route::patch('/{id}',       [StudioAdCampaignController::class, 'update'])->name('update');
                Route::delete('/{id}',      [StudioAdCampaignController::class, 'destroy'])->name('destroy');
                Route::post('/{id}/submit', [StudioAdCampaignController::class, 'submit'])->name('submit');
                Route::post('/{id}/pause',  [StudioAdCampaignController::class, 'pause'])->name('pause');
                Route::post('/{id}/resume', [StudioAdCampaignController::class, 'resume'])->name('resume');
                Route::post('/{campaign}/ad-groups', [StudioAdGroupController::class, 'store'])->name('groups.store');
            });
            Route::prefix('ad-groups')->name('ad-groups.')->group(function () {
                Route::patch('/{id}',  [StudioAdGroupController::class, 'update'])->name('update');
                Route::delete('/{id}', [StudioAdGroupController::class, 'destroy'])->name('destroy');
                Route::post('/{group}/creatives', [StudioAdCreativeController::class, 'store'])->name('creatives.store');
            });
            Route::prefix('ad-creatives')->name('ad-creatives.')->group(function () {
                Route::post('/upload-url', [StudioAdCreativeController::class, 'uploadUrl'])->name('upload-url');
                Route::delete('/{id}',     [StudioAdCreativeController::class, 'destroy'])->name('destroy');
            });
            Route::get('/ad-account',            [StudioAdAccountController::class, 'show'])->name('ad-account.show');
            Route::patch('/ad-account/settings', [StudioAdAccountController::class, 'updateSettings'])->name('ad-account.settings');
            Route::post('/ad-account/topup',     [StudioAdAccountController::class, 'topup'])->name('ad-account.topup');
            Route::get('/ad-insights/overview', [StudioAdInsightsController::class, 'overview'])->name('ad-insights.overview');
            Route::get('/ad-insights/dashboard', [StudioAdInsightsController::class, 'dashboard'])->name('ad-insights.dashboard');

            // Settings (admin only)
            Route::prefix('settings')->name('settings.')->group(function () {
                Route::get('/',           [StudioSettingsController::class, 'index'])->name('index');
                Route::post('/cache/clear', [StudioSettingsController::class, 'clearCache'])->name('cache.clear');
                Route::get('/test/connection', [StudioSettingsController::class, 'testConnection'])->name('test-connection');
                Route::get('/{key}',      [StudioSettingsController::class, 'show'])->name('show');
                Route::post('/{key}',     [StudioSettingsController::class, 'update'])->name('update');
            });
        });

        // Verification - step-by-step flow
        Route::prefix('verification')->name('verification.')->group(function () {
            Route::get('/',                      [VerificationController::class, 'status'])->name('status');
            // A FREE ID review for monetization eligibility - no plan, no payment,
            // no tick. Four of the five programmes require identity verified, and
            // a subscription must not stand between a creator and their earnings.
            Route::post('/identity/start',       [VerificationController::class, 'startIdentity'])->name('identity.start');
            Route::post('/select-plan',          [VerificationController::class, 'selectPlan'])->name('select-plan');
            Route::post('/account-check',        [VerificationController::class, 'accountCheck'])->name('account-check');
            Route::post('/upload-documents',     [VerificationController::class, 'uploadDocuments'])->name('upload-documents')->middleware('throttle:10,60');
            Route::post('/submit',               [VerificationController::class, 'submitReview'])->name('submit')->middleware('throttle:10,60');
            Route::post('/renew',                [VerificationController::class, 'renew'])->name('renew');
            Route::post('/apply',                [VerificationController::class, 'apply'])->name('apply'); // legacy

            // Blue Verified subscription payment. Same gateways as the coins page (the
            // admin toggles are shared), same create-then-capture shape.
            Route::prefix('payment')->name('payment.')->group(function () {
                Route::get('/methods',         [VerificationPaymentController::class, 'methods'])->name('methods');
                Route::post('/order',          [VerificationPaymentController::class, 'createOrder'])->name('order')->middleware('throttle:10,1');
                Route::post('/stripe/intent',  [VerificationPaymentController::class, 'stripeIntent'])->name('stripe.intent')->middleware('throttle:10,1');
                Route::post('/stripe/capture', [VerificationPaymentController::class, 'stripeCapture'])->name('stripe.capture')->middleware('throttle:10,1');
                Route::post('/paypal/capture', [VerificationPaymentController::class, 'paypalCapture'])->name('paypal.capture')->middleware('throttle:10,1');
                // Apple IAP / Google Play Billing - required by both stores for digital
                // goods, which a verification badge is.
                Route::post('/iap/verify',     [VerificationPaymentController::class, 'verifyIap'])->name('iap.verify')->middleware('throttle:10,1');
            });
        });

        // Wallet (legacy)
        Route::prefix('wallet')->name('wallet.')->group(function () {
            Route::get('/',             [WalletController::class, 'show'])->name('show');
            Route::get('/transactions', [WalletController::class, 'transactions'])->name('transactions');
        });

        // Wallets & Coins - comprehensive coin system
        Route::prefix('studio/wallets-coins')->name('studio.wallets-coins.')->group(function () {
            Route::get('/',                          [StudioWalletCoinsController::class, 'index'])->name('index');
            Route::get('/packages',                  [StudioWalletCoinsController::class, 'packages'])->name('packages');
            Route::get('/transactions',              [StudioWalletCoinsController::class, 'transactions'])->name('transactions');
            Route::post('/orders',                   [StudioWalletCoinsController::class, 'createOrder'])->name('orders.create')->middleware('throttle:10,1');
            Route::post('/orders/paypal/capture',    [StudioWalletCoinsController::class, 'capturePaypalOrder'])->name('orders.paypal.capture')->middleware('throttle:10,1');
            // Stripe coin orders
            Route::post('/orders/stripe/intent',    [StudioWalletCoinsController::class, 'createStripeIntent'])->name('orders.stripe.intent')->middleware('throttle:10,1');
            Route::post('/orders/stripe/capture',   [StudioWalletCoinsController::class, 'captureStripePayment'])->name('orders.stripe.capture')->middleware('throttle:10,1');
            // Razorpay coin orders
            Route::post('/orders/razorpay/create',  [StudioWalletCoinsController::class, 'createRazorpayOrder'])->name('orders.razorpay.create')->middleware('throttle:10,1');
            Route::post('/orders/razorpay/capture', [StudioWalletCoinsController::class, 'captureRazorpayPayment'])->name('orders.razorpay.capture')->middleware('throttle:10,1');
            // Bank transfer coin orders
            Route::post('/orders/bank/create',      [StudioWalletCoinsController::class, 'createBankTransferOrder'])->name('orders.bank.create')->middleware('throttle:10,1');
            // In-app purchase (coins). Apple requires StoreKit for digital content, so the
            // iOS app buys coins here rather than through the web card/PayPal checkout.
            Route::get('/iap/products',             [StudioWalletCoinsController::class, 'iapProducts'])->name('iap.products');
            Route::post('/iap/verify',              [StudioWalletCoinsController::class, 'iapVerify'])->name('iap.verify')->middleware('throttle:20,1');
        });

        // Gifts - catalog + send a coin-gift to another user (e.g. from comments)
        Route::prefix('gifts')->name('gifts.')->group(function () {
            Route::get('/',     [GiftController::class, 'index'])->name('index');
            Route::post('/send', [GiftController::class, 'send'])->name('send')->middleware('throttle:30,1');
            // Gifts you received / sent, WITH the other person - coin_gifts has
            // sender_id + receiver_id, which wallet_transactions never did.
            Route::get('/history',         [GiftController::class, 'history'])->name('history');
            Route::get('/top-supporters',  [GiftController::class, 'topSupporters'])->name('top-supporters');
        });
        // Whether to show a gift-sending affordance for this user at all -
        // comments, LIVE, wherever a gift icon appears on someone's content.
        Route::get('/users/{id}/gifts-eligible', [GiftController::class, 'eligible'])->whereNumber('id')->name('users.gifts-eligible');

        // Subscriptions
        Route::prefix('studio/subscriptions')->name('studio.subscriptions.')->group(function () {
            Route::get('/',                  [StudioSubscriptionController::class, 'current'])->name('current');
            Route::post('/intent',           [StudioSubscriptionController::class, 'createIntent'])->name('intent');
            Route::post('/capture/stripe',   [StudioSubscriptionController::class, 'captureStripe'])->name('capture.stripe');
            Route::post('/capture/paypal',   [StudioSubscriptionController::class, 'capturePaypal'])->name('capture.paypal');
            Route::post('/capture/razorpay', [StudioSubscriptionController::class, 'captureRazorpay'])->name('capture.razorpay');
            Route::post('/cancel',           [StudioSubscriptionController::class, 'cancel'])->name('cancel');
            // Premium in the app. Digital content must be sold by the store's own
            // billing (App Store 3.1.1 / Play policy) - never a card form in-app,
            // and never a link out to the web checkout.
            Route::get('/iap/products',      [StudioSubscriptionController::class, 'iapProducts'])->name('iap.products');
            Route::post('/iap/verify',       [StudioSubscriptionController::class, 'verifyIap'])->name('iap.verify')->middleware('throttle:10,1');
        });

        // Devices
        Route::prefix('devices')->name('devices.')->group(function () {
            Route::post('/',           [DeviceController::class, 'register'])->name('register');
            // POST, not DELETE: the token is the identifier and it is far too
            // long to sit in a path segment, and DELETE bodies are not
            // dependably forwarded by every hop in front of this.
            Route::post('/unregister', [DeviceController::class, 'unregister'])->name('unregister');
            Route::delete('/{id}',     [DeviceController::class, 'destroy'])->name('destroy');
        });

        // Moderation - user-facing status and rescan
        Route::prefix('media')->name('media.')->group(function () {
            Route::get('/{contentId}/moderation-status', [ModerationController::class, 'status'])
                 ->name('moderation-status');
            Route::post('/{contentId}/rescan', [ModerationController::class, 'rescan'])
                 ->name('rescan')
                 ->middleware('throttle:5,60');
        });

        // Submit an appeal against the caller's own most recent active strike.
        Route::post('/moderation/appeal', [ModerationController::class, 'submitAppeal'])
             ->name('moderation.appeal')
             ->middleware('throttle:10,1440');

        // Country module - 60-day lock + continuous-verification
        Route::prefix('user')->name('user.')->group(function () {
            Route::get('/country-status',              [CountryController::class, 'status'])->name('country-status');
            Route::post('/country-heartbeat',          [CountryController::class, 'heartbeat'])->name('country-heartbeat')->middleware('throttle:120,1');
            Route::post('/request-country-change',     [CountryController::class, 'requestChange'])->name('request-country-change')->middleware('throttle:5,60');
            Route::post('/confirm-country-change',     [CountryController::class, 'confirmChange'])->name('confirm-country-change')->middleware('throttle:5,60');
            Route::get('/country-residency-documents', [CountryController::class, 'listResidencyDocuments'])->name('country-residency-documents.index');
            Route::post('/country-residency-documents',[CountryController::class, 'submitResidencyDocument'])->name('country-residency-documents.store')->middleware('throttle:5,60');
        });

        // Admin API - Sanctum + admin role (JSON responses)
        Route::middleware(['api.admin', 'demo.readonly'])
            ->prefix('admin')
            ->name('admin.')
            ->group(function () {
                // ── Overview Dashboard ────────────────────────────────────
                Route::get('/dashboard/overview',             [AdminOverviewController::class, 'overview'])->name('dashboard.overview');
                Route::get('/dashboard/analytics',            [AdminOverviewController::class, 'analytics'])->name('dashboard.analytics');
                Route::get('/dashboard/revenue',              [AdminOverviewController::class, 'revenue'])->name('dashboard.revenue');
                Route::get('/monetization/overview',          [\App\Http\Controllers\Api\Admin\AdminMonetizationController::class, 'overview'])->name('monetization.overview');

                /* ── Admin roles & permissions (RBAC) ──────────────────────
                   Read endpoints require roles.view / admins.view; every write
                   requires its own permission AND is re-checked server-side in
                   AdminRbacService, which is what actually stops an admin from
                   promoting themselves. The middleware is the outer gate, not
                   the whole defence. */
                Route::prefix('rbac')->name('rbac.')->group(function () {
                    $C = \App\Http\Controllers\Api\Admin\AdminRbacController::class;

                    Route::get('/overview',      [$C, 'overview'])->middleware('permission:admins.view')->name('overview');
                    Route::get('/permissions',   [$C, 'permissions'])->middleware('permission:roles.view')->name('permissions');
                    Route::get('/matrix',        [$C, 'matrix'])->middleware('permission:roles.view')->name('matrix');
                    Route::get('/activity',      [$C, 'activity'])->middleware('permission:admins.activity')->name('activity');
                    Route::get('/search-users',  [$C, 'searchUsers'])->middleware('permission:admins.create')->name('search-users');

                    Route::get('/roles',                 [$C, 'roles'])->middleware('permission:roles.view')->name('roles');
                    Route::get('/roles/{id}',            [$C, 'showRole'])->whereNumber('id')->middleware('permission:roles.view')->name('roles.show');
                    Route::post('/roles',                [$C, 'createRole'])->middleware('permission:roles.create')->name('roles.create');
                    Route::put('/roles/{id}',            [$C, 'updateRole'])->whereNumber('id')->middleware('permission:roles.edit')->name('roles.update');
                    Route::post('/roles/{id}/duplicate', [$C, 'duplicateRole'])->whereNumber('id')->middleware('permission:roles.create')->name('roles.duplicate');
                    Route::delete('/roles/{id}',         [$C, 'deleteRole'])->whereNumber('id')->middleware('permission:roles.delete')->name('roles.delete');

                    Route::get('/administrators',        [$C, 'administrators'])->middleware('permission:admins.view')->name('admins');
                    Route::get('/administrators/{id}',   [$C, 'showAdministrator'])->whereNumber('id')->middleware('permission:admins.view')->name('admins.show');
                    Route::post('/administrators',       [$C, 'createAdministrator'])->middleware('permission:admins.create')->name('admins.create');
                    Route::put('/administrators/{id}',   [$C, 'updateAdministrator'])->whereNumber('id')->middleware('permission:admins.edit')->name('admins.update');
                    Route::delete('/administrators/{id}',[$C, 'removeAdministrator'])->whereNumber('id')->middleware('permission:admins.remove')->name('admins.remove');
                    Route::post('/administrators/{id}/revoke-sessions', [$C, 'revokeSessions'])->whereNumber('id')->middleware('permission:security.revoke_sessions')->name('admins.revoke-sessions');
                });
                Route::get('/dashboard/recent-transactions',  [AdminOverviewController::class, 'recentTransactions'])->name('dashboard.recent-transactions');
                Route::get('/dashboard/top-creators',         [AdminOverviewController::class, 'topCreators'])->name('dashboard.top-creators');
                Route::get('/dashboard/system-status',        [AdminOverviewController::class, 'systemStatus'])->name('dashboard.system-status');
                Route::get('/dashboard/mini-metrics',         [AdminOverviewController::class, 'miniMetrics'])->name('dashboard.mini-metrics');

                // ── Fine-grained admin permissions (grant/revoke) - each
                //    method does its own super_admin check inline, matching
                //    the codebase's existing ad hoc role-check convention. ──
                Route::get('/permissions', [\App\Http\Controllers\Api\Admin\AdminPermissionController::class, 'index'])->name('permissions.index');
                Route::post('/users/{id}/permissions', [\App\Http\Controllers\Api\Admin\AdminPermissionController::class, 'grant'])->whereNumber('id')->name('permissions.grant');
                Route::delete('/users/{id}/permissions/{permission}', [\App\Http\Controllers\Api\Admin\AdminPermissionController::class, 'revoke'])->whereNumber('id')->name('permissions.revoke');

                // ── REELSOO COUNTRY AVAILABILITY - stacks the new per-admin
                //    permission gate on top of the standard api.admin group. ──
                Route::prefix('settings/country-availability')
                    ->name('settings.country-availability.')
                    ->middleware('permission:manage_country_availability')
                    ->group(function () {
                        Route::get('/',    [\App\Http\Controllers\Api\Admin\AdminCountryAvailabilityController::class, 'index'])->name('index');
                        Route::get('/history', [\App\Http\Controllers\Api\Admin\AdminCountryAvailabilityController::class, 'history'])->name('history');
                        Route::get('/provider-health', [\App\Http\Controllers\Api\Admin\AdminCountryAvailabilityController::class, 'providerHealth'])->name('provider-health');
                        Route::put('/',    [\App\Http\Controllers\Api\Admin\AdminCountryAvailabilityController::class, 'updateGlobal'])->name('update-global');
                        Route::get('/countries/{code}', [\App\Http\Controllers\Api\Admin\AdminCountryAvailabilityController::class, 'show'])->where('code', '[A-Za-z]{2}')->name('show-country');
                        Route::put('/countries/{code}', [\App\Http\Controllers\Api\Admin\AdminCountryAvailabilityController::class, 'updateCountry'])->where('code', '[A-Za-z]{2}')->name('update-country');
                        Route::post('/bulk', [\App\Http\Controllers\Api\Admin\AdminCountryAvailabilityController::class, 'bulk'])->name('bulk');
                    });


                /* ── Marketplace licence management ────────────────────────
                   "Reelsoo Code Purchase" in the admin panel. Stacks the
                   per-admin manage_licenses grant on top of the api.admin
                   group, exactly as country-availability does above, so an
                   ordinary user cannot reach it and neither can an admin who
                   has not been granted it. Enforcement is server-side; the
                   frontend guard is convenience only.

                   LICENSOR SIDE - excluded from the marketplace package. */
                Route::prefix('licenses')
                    ->name('licenses.')
                    ->middleware('permission:manage_licenses')
                    ->group(function () {
                        Route::get('/', [\App\Http\Controllers\Api\Admin\AdminLicenseController::class, 'index'])->name('index');

                        // Declared BEFORE /{licenseId} so "purchase-codes" is
                        // never captured as a licence id by the wildcard.
                        Route::get('/purchase-codes',  [\App\Http\Controllers\Api\Admin\AdminLicenseController::class, 'purchaseCodes'])->name('purchase-codes.index');
                        Route::post('/purchase-codes', [\App\Http\Controllers\Api\Admin\AdminLicenseController::class, 'generatePurchaseCodes'])->name('purchase-codes.store');
                        Route::post('/purchase-codes/{id}/disable', [\App\Http\Controllers\Api\Admin\AdminLicenseController::class, 'disablePurchaseCode'])->whereNumber('id')->name('purchase-codes.disable');

                        Route::get('/{licenseId}', [\App\Http\Controllers\Api\Admin\AdminLicenseController::class, 'show'])->name('show');
                        Route::post('/{licenseId}/suspend',          [\App\Http\Controllers\Api\Admin\AdminLicenseController::class, 'suspend'])->name('suspend');
                        Route::post('/{licenseId}/reactivate',       [\App\Http\Controllers\Api\Admin\AdminLicenseController::class, 'reactivate'])->name('reactivate');
                        Route::post('/{licenseId}/revoke',           [\App\Http\Controllers\Api\Admin\AdminLicenseController::class, 'revoke'])->name('revoke');
                        Route::post('/{licenseId}/reset-activation', [\App\Http\Controllers\Api\Admin\AdminLicenseController::class, 'resetActivation'])->name('reset-activation');
                        Route::post('/{licenseId}/change-domain',    [\App\Http\Controllers\Api\Admin\AdminLicenseController::class, 'changeDomain'])->name('change-domain');
                        Route::post('/{licenseId}/reveal',           [\App\Http\Controllers\Api\Admin\AdminLicenseController::class, 'reveal'])->name('reveal');
                    })->where('licenseId', 'lic_[a-z0-9]+');

                /* This installation's OWN licence status. Ships to customers
                   (unlike everything above), so their admin can see whether
                   their copy is licensed. Returns conclusions only - never a
                   token, key or purchase code. */
                Route::get('/license/local', [\App\Http\Controllers\Api\License\LocalLicenseController::class, 'show'])->name('license.local');

                /* ── Comment moderation ────────────────────────────────────
                   The panel's Comments page was a placeholder while the data
                   behind it was already complete - video_comments carries
                   is_hidden / is_spam / held_for_review / soft deletes, and
                   comment_reports carries user reports. This exposes it.

                   Nothing here hard-deletes: removal is a soft delete so a
                   mistake is recoverable and a comment removed during a
                   dispute can still be produced. */
                Route::prefix('comments')->name('comments.')->group(function () {
                    Route::get('/',            [\App\Http\Controllers\Api\Admin\AdminCommentController::class, 'index'])->name('index');
                    Route::post('/bulk',       [\App\Http\Controllers\Api\Admin\AdminCommentController::class, 'bulk'])->name('bulk');
                    Route::post('/reports/{id}/resolve', [\App\Http\Controllers\Api\Admin\AdminCommentController::class, 'resolveReport'])->whereNumber('id')->name('reports.resolve');
                    Route::get('/{id}',        [\App\Http\Controllers\Api\Admin\AdminCommentController::class, 'show'])->whereNumber('id')->name('show');
                    Route::post('/{id}/action',[\App\Http\Controllers\Api\Admin\AdminCommentController::class, 'action'])->whereNumber('id')->name('action');
                });
                // ── Gifts & Coins management ──────────────────────────────
                // price_usd here is what a user is actually charged, and coin_value is
                // what a gift costs to send. Both are the till - admin-only, always.
                Route::get('/gift-coins/stats', [AdminGiftCoinController::class, 'stats'])->name('gift-coins.stats');

                /* ── Live streams: platform control ────────────────────────
                   Deliberately not reachable by a broadcaster. Featuring,
                   force-ending someone else's stream and takedowns all write
                   the admin's id to live_stream_events. */
                Route::prefix('live-streams')->name('live-streams.')->group(function () {
                    Route::get('/',                  [AdminLiveStreamController::class, 'index'])->name('index');
                    Route::get('/{id}/events',       [AdminLiveStreamController::class, 'events'])->whereNumber('id')->name('events');
                    Route::post('/{id}/feature',     [AdminLiveStreamController::class, 'feature'])->whereNumber('id')->name('feature');
                    Route::post('/{id}/unfeature',   [AdminLiveStreamController::class, 'unfeature'])->whereNumber('id')->name('unfeature');
                    Route::post('/{id}/ban',         [AdminLiveStreamController::class, 'ban'])->whereNumber('id')->name('ban');
                    Route::post('/{id}/unban',       [AdminLiveStreamController::class, 'unban'])->whereNumber('id')->name('unban');
                    Route::post('/{id}/force-end',   [AdminLiveStreamController::class, 'forceEnd'])->whereNumber('id')->name('force-end');
                });

                Route::prefix('coin-packages')->name('coin-packages.')->group(function () {
                    Route::get('/',               [AdminGiftCoinController::class, 'packages'])->name('index');
                    Route::post('/',              [AdminGiftCoinController::class, 'storePackage'])->name('store');
                    Route::put('/{id}',           [AdminGiftCoinController::class, 'updatePackage'])->name('update')->where('id', '[0-9]+');
                    Route::post('/{id}/icon',     [AdminGiftCoinController::class, 'uploadPackageIcon'])->name('icon')->where('id', '[0-9]+');
                    Route::delete('/{id}/icon',   [AdminGiftCoinController::class, 'resetPackageIcon'])->name('icon.reset')->where('id', '[0-9]+');
                    Route::delete('/{id}',        [AdminGiftCoinController::class, 'destroyPackage'])->name('destroy')->where('id', '[0-9]+');
                });

                // ── Reelsoo Shop → Categories + shop visibility ───────────
                Route::prefix('shop')->name('shop.')->group(function () {
                    Route::prefix('categories')->name('categories.')->group(function () {
                        Route::get('/',        [\App\Http\Controllers\Api\Admin\AdminShopController::class, 'categories'])->name('index');
                        Route::post('/',       [\App\Http\Controllers\Api\Admin\AdminShopController::class, 'storeCategory'])->name('store');
                        Route::put('/{id}',    [\App\Http\Controllers\Api\Admin\AdminShopController::class, 'updateCategory'])->name('update')->where('id', '[0-9]+');
                        Route::delete('/{id}', [\App\Http\Controllers\Api\Admin\AdminShopController::class, 'destroyCategory'])->name('destroy')->where('id', '[0-9]+');
                    });
                    Route::get('/shops', [\App\Http\Controllers\Api\Admin\AdminShopController::class, 'shops'])->name('shops.index');

                    // "Sell on Reelsoo" seller application review queue.
                    Route::prefix('applications')->name('applications.')->group(function () {
                        Route::get('/',     [\App\Http\Controllers\Api\Admin\AdminShopController::class, 'applications'])->name('index');
                        Route::get('/{id}', [\App\Http\Controllers\Api\Admin\AdminShopController::class, 'applicationShow'])->name('show')->where('id', '[0-9]+');
                        Route::post('/{id}/approve',        [\App\Http\Controllers\Api\Admin\AdminShopController::class, 'approveApplication'])->name('approve')->where('id', '[0-9]+');
                        Route::post('/{id}/reject',         [\App\Http\Controllers\Api\Admin\AdminShopController::class, 'rejectApplication'])->name('reject')->where('id', '[0-9]+');
                        Route::post('/{id}/request-info',   [\App\Http\Controllers\Api\Admin\AdminShopController::class, 'requestApplicationInfo'])->name('request-info')->where('id', '[0-9]+');
                        Route::post('/{id}/suspend',        [\App\Http\Controllers\Api\Admin\AdminShopController::class, 'suspendApplication'])->name('suspend')->where('id', '[0-9]+');
                        Route::post('/{id}/reactivate',     [\App\Http\Controllers\Api\Admin\AdminShopController::class, 'reactivateApplication'])->name('reactivate')->where('id', '[0-9]+');
                        Route::post('/{id}/documents/{docId}/review', [\App\Http\Controllers\Api\Admin\AdminShopController::class, 'reviewDocument'])->name('documents.review')->where(['id' => '[0-9]+', 'docId' => '[0-9]+']);
                    });

                    // Per-country/seller-type required fields & documents -
                    // what SellerApplicationController resolves against.
                    Route::prefix('country-requirements')->name('country-requirements.')->group(function () {
                        Route::get('/',        [\App\Http\Controllers\Api\Admin\AdminShopController::class, 'countryRequirements'])->name('index');
                        Route::post('/',       [\App\Http\Controllers\Api\Admin\AdminShopController::class, 'storeCountryRequirement'])->name('store');
                        Route::put('/{id}',    [\App\Http\Controllers\Api\Admin\AdminShopController::class, 'updateCountryRequirement'])->name('update')->where('id', '[0-9]+');
                        Route::delete('/{id}', [\App\Http\Controllers\Api\Admin\AdminShopController::class, 'destroyCountryRequirement'])->name('destroy')->where('id', '[0-9]+');
                    });

                    // Marketplace home curation - promo banners, deals of the
                    // day (an admin-only cross-shop product search feeds the
                    // deal picker) and marketplace coupons. See
                    // ShopController::promoBanners/deals/coupons for the
                    // matching public read side.
                    Route::prefix('promo-banners')->name('promo-banners.')->group(function () {
                        Route::get('/',        [\App\Http\Controllers\Api\Admin\AdminShopPromoBannerController::class, 'index'])->name('index');
                        Route::post('/',       [\App\Http\Controllers\Api\Admin\AdminShopPromoBannerController::class, 'store'])->name('store');
                        Route::post('/{id}',   [\App\Http\Controllers\Api\Admin\AdminShopPromoBannerController::class, 'update'])->name('update')->where('id', '[0-9]+');
                        Route::delete('/{id}', [\App\Http\Controllers\Api\Admin\AdminShopPromoBannerController::class, 'destroy'])->name('destroy')->where('id', '[0-9]+');
                    });
                    Route::prefix('deals')->name('deals.')->group(function () {
                        Route::get('/',        [\App\Http\Controllers\Api\Admin\AdminShopDealController::class, 'index'])->name('index');
                        Route::post('/',       [\App\Http\Controllers\Api\Admin\AdminShopDealController::class, 'store'])->name('store');
                        Route::put('/{id}',    [\App\Http\Controllers\Api\Admin\AdminShopDealController::class, 'update'])->name('update')->where('id', '[0-9]+');
                        Route::delete('/{id}', [\App\Http\Controllers\Api\Admin\AdminShopDealController::class, 'destroy'])->name('destroy')->where('id', '[0-9]+');
                    });
                    // Registered here rather than under /admin/products (no
                    // such namespace exists - products stay seller-scoped
                    // everywhere else) since this exists ONLY for the deal picker.
                    Route::get('/products/search', [\App\Http\Controllers\Api\Admin\AdminShopDealController::class, 'searchProducts'])->name('products.search');
                    Route::prefix('coupons')->name('coupons.')->group(function () {
                        Route::get('/',        [\App\Http\Controllers\Api\Admin\AdminShopCouponController::class, 'index'])->name('index');
                        Route::post('/',       [\App\Http\Controllers\Api\Admin\AdminShopCouponController::class, 'store'])->name('store');
                        Route::put('/{id}',    [\App\Http\Controllers\Api\Admin\AdminShopCouponController::class, 'update'])->name('update')->where('id', '[0-9]+');
                        Route::delete('/{id}', [\App\Http\Controllers\Api\Admin\AdminShopCouponController::class, 'destroy'])->name('destroy')->where('id', '[0-9]+');
                    });
                });

                // ── Monetization → Coupons & Offers ───────────────────────
                // Definitions the public checkout validates against. Export is
                // registered BEFORE /{id} so "export" is not read as an id.
                Route::prefix('coupons')->name('coupons.')->group(function () {
                    Route::get('/export', [\App\Http\Controllers\Api\Admin\AdminCouponController::class, 'export'])->name('export');
                    Route::get('/',       [\App\Http\Controllers\Api\Admin\AdminCouponController::class, 'index'])->name('index');
                    Route::post('/',      [\App\Http\Controllers\Api\Admin\AdminCouponController::class, 'store'])->name('store');
                    Route::put('/{id}',   [\App\Http\Controllers\Api\Admin\AdminCouponController::class, 'update'])->name('update')->where('id', '[0-9]+');
                    Route::delete('/{id}', [\App\Http\Controllers\Api\Admin\AdminCouponController::class, 'destroy'])->name('destroy')->where('id', '[0-9]+');
                });

                // ── Monetization → Premium Subscription ───────────────────
                // The tiers behind the app's premium page. Same admin guard as
                // the rest of this group.
                /* Country reference data for the admin pickers. Shared by the
                   Availability and Pricing tabs so both offer exactly the
                   countries the resolver knows about. */
                Route::get('/countries', [\App\Http\Controllers\Api\Admin\AdminPlanPricingController::class, 'countries'])->name('countries');

                /* Plan pricing (global vs country-specific). Nested under the
                   plan it belongs to, and inside the same admin guard as the
                   rest of this group - authorisation is not re-implemented. */
                Route::prefix('premium-plans/{id}/pricing')->name('premium-plans.pricing.')->where(['id' => '[0-9]+'])->group(function () {
                    Route::get('/',          [\App\Http\Controllers\Api\Admin\AdminPlanPricingController::class, 'show'])->name('show');
                    Route::put('/mode',      [\App\Http\Controllers\Api\Admin\AdminPlanPricingController::class, 'setMode'])->name('mode');
                    Route::post('/override', [\App\Http\Controllers\Api\Admin\AdminPlanPricingController::class, 'upsertOverride'])->name('override');
                    Route::delete('/override', [\App\Http\Controllers\Api\Admin\AdminPlanPricingController::class, 'deleteOverride'])->name('override.delete');
                    Route::post('/bulk',     [\App\Http\Controllers\Api\Admin\AdminPlanPricingController::class, 'bulk'])->name('bulk');
                    Route::get('/history',   [\App\Http\Controllers\Api\Admin\AdminPlanPricingController::class, 'history'])->name('history');
                    Route::get('/preview',   [\App\Http\Controllers\Api\Admin\AdminPlanPricingController::class, 'preview'])->name('preview');
                    Route::post('/flush',    [\App\Http\Controllers\Api\Admin\AdminPlanPricingController::class, 'flushCache'])->name('flush');
                });

                Route::prefix('premium-plans')->name('premium-plans.')->group(function () {
                    Route::get('/',     [\App\Http\Controllers\Api\Admin\AdminPremiumPlanController::class, 'index'])->name('index');
                    Route::get('/stats', [\App\Http\Controllers\Api\Admin\AdminPremiumPlanController::class, 'stats'])->name('stats');
                    Route::post('/',    [\App\Http\Controllers\Api\Admin\AdminPremiumPlanController::class, 'store'])->name('store');
                    Route::put('/{id}', [\App\Http\Controllers\Api\Admin\AdminPremiumPlanController::class, 'update'])->name('update')->where('id', '[0-9]+');
                    Route::delete('/{id}', [\App\Http\Controllers\Api\Admin\AdminPremiumPlanController::class, 'destroy'])->name('destroy')->where('id', '[0-9]+');
                });

                // ── Reelsoo Ads management ────────────────────────────────
                Route::prefix('ads')->name('ads.')->group(function () {
                    Route::get('/overview',                [AdminAdController::class, 'overview'])->name('overview');
                    Route::get('/overview/performance',    [AdminAdController::class, 'performance'])->name('overview.performance');
                    Route::get('/overview/revenue',        [AdminAdController::class, 'revenue'])->name('overview.revenue');
                    Route::get('/campaigns',               [AdminAdController::class, 'campaigns'])->name('campaigns.index');
                    Route::get('/campaigns/summary',       [AdminAdController::class, 'campaignsSummary'])->name('campaigns.summary');
                    Route::get('/approvals',               [AdminAdController::class, 'approvals'])->name('approvals.index');
                    Route::get('/approvals/summary',       [AdminAdController::class, 'approvalsSummary'])->name('approvals.summary');
                    Route::get('/campaigns/{id}',          [AdminAdController::class, 'campaign'])->where('id', '[0-9]+')->name('campaigns.show');
                    Route::get('/campaigns/{id}/detail',   [AdminAdController::class, 'campaignDetail'])->where('id', '[0-9]+')->name('campaigns.detail');
                    Route::post('/campaigns/{id}/approve', [AdminAdController::class, 'approve'])->where('id', '[0-9]+')->name('campaigns.approve');
                    Route::post('/campaigns/{id}/reject',  [AdminAdController::class, 'reject'])->where('id', '[0-9]+')->name('campaigns.reject');
                    Route::post('/campaigns/{id}/ban',     [AdminAdController::class, 'ban'])->where('id', '[0-9]+')->name('campaigns.ban');
                    Route::post('/campaigns/{id}/request-changes', [AdminAdController::class, 'requestChanges'])->where('id', '[0-9]+')->name('campaigns.request-changes');
                    Route::post('/campaigns/{id}/pause',     [AdminAdController::class, 'pause'])->where('id', '[0-9]+')->name('campaigns.pause');
                    Route::post('/campaigns/{id}/resume',    [AdminAdController::class, 'resume'])->where('id', '[0-9]+')->name('campaigns.resume');
                    Route::post('/campaigns/{id}/end',       [AdminAdController::class, 'end'])->where('id', '[0-9]+')->name('campaigns.end');
                    Route::post('/campaigns/{id}/duplicate', [AdminAdController::class, 'duplicate'])->where('id', '[0-9]+')->name('campaigns.duplicate');
                    Route::delete('/campaigns/{id}',         [AdminAdController::class, 'destroy'])->where('id', '[0-9]+')->name('campaigns.destroy');
                    Route::get('/advertisers',             [AdminAdController::class, 'advertisers'])->name('advertisers.index');
                    Route::get('/fraud',                   [AdminAdController::class, 'fraud'])->name('fraud.index');
                    Route::get('/placements',              [AdminAdController::class, 'placements'])->name('placements.index');
                    Route::patch('/placements/{id}',       [AdminAdController::class, 'updatePlacement'])->where('id', '[0-9]+')->name('placements.update');
                    Route::get('/settings',                [AdminAdController::class, 'settings'])->name('settings.index');
                    Route::post('/settings',               [AdminAdController::class, 'updateSettings'])->name('settings.update');
                });

                // ── Legacy audio (admin) ──────────────────────────────────
                Route::prefix('audio')->name('audio.')->group(function () {
                    Route::get('/',         [AudioController::class, 'adminIndex'])->name('index');
                    Route::post('/',        [AudioController::class, 'adminStore'])->name('store');
                    Route::delete('/{id}',  [AudioController::class, 'adminDestroy'])->name('destroy');
                });

                // ── Sounds (music tracks used in videos) ─────────────────
                Route::prefix('sounds')->name('sounds.')->group(function () {
                    Route::get('/stats',          [AdminSoundsController::class, 'stats'])->name('stats');
                    Route::get('/',               [AdminSoundsController::class, 'index'])->name('index');
                    Route::get('/{id}/videos',    [AdminSoundsController::class, 'videos'])->where('id', '[0-9]+')->name('videos');
                });

                // ── Audio Rooms / Spaces (live audio) ────────────────────
                // Read-only plus the two moderator levers; rooms are hosted by
                // users from the app, never authored here. /stats before /{id}
                // so "stats" is not swallowed as an id.
                Route::prefix('spaces')->name('spaces.')->group(function () {
                    Route::get('/stats',        [AdminSpaceController::class, 'stats'])->name('stats');
                    Route::get('/',             [AdminSpaceController::class, 'index'])->name('index');
                    Route::get('/{space}',      [AdminSpaceController::class, 'show'])->whereNumber('space')->name('show');
                    Route::post('/{space}/end', [AdminSpaceController::class, 'end'])->whereNumber('space')->name('end');
                    Route::delete('/{space}',   [AdminSpaceController::class, 'destroy'])->whereNumber('space')->name('destroy');
                    // Live moderation levers (real DB state + audit log).
                    Route::patch('/{space}/controls',          [AdminSpaceController::class, 'updateControls'])->whereNumber('space')->name('controls');
                    Route::post('/{space}/mute-all',           [AdminSpaceController::class, 'muteAll'])->whereNumber('space')->name('mute-all');
                    Route::post('/{space}/clear-requests',     [AdminSpaceController::class, 'clearRequests'])->whereNumber('space')->name('clear-requests');
                    Route::post('/{space}/remove-listeners',   [AdminSpaceController::class, 'removeListeners'])->whereNumber('space')->name('remove-listeners');
                    Route::post('/{space}/participants/{participant}/mute',   [AdminSpaceController::class, 'muteParticipant'])->whereNumber(['space', 'participant'])->name('participant.mute');
                    Route::post('/{space}/participants/{participant}/remove', [AdminSpaceController::class, 'removeParticipant'])->whereNumber(['space', 'participant'])->name('participant.remove');
                });

                // ── Hashtag Challenges (full CRUD - staff-authored content) ──
                // /stats before /{challenge} so "stats" is not swallowed as an id.
                Route::prefix('challenges')->name('challenges.')->group(function () {
                    Route::get('/stats',            [AdminChallengeController::class, 'stats'])->name('stats');
                    Route::get('/',                 [AdminChallengeController::class, 'index'])->name('index');
                    Route::post('/',                [AdminChallengeController::class, 'store'])->name('store');
                    Route::get('/{challenge}',      [AdminChallengeController::class, 'show'])->whereNumber('challenge')->name('show');
                    Route::patch('/{challenge}',    [AdminChallengeController::class, 'update'])->whereNumber('challenge')->name('update');
                    Route::post('/{challenge}/end', [AdminChallengeController::class, 'end'])->whereNumber('challenge')->name('end');
                    Route::delete('/{challenge}',   [AdminChallengeController::class, 'destroy'])->whereNumber('challenge')->name('destroy');
                });

                // ── Music Library (full admin CRUD + R2) ─────────────────
                /*
                 * Third-party integration credentials. Admin-only (this whole
                 * group is behind api.admin) and rate-limited tighter than the
                 * surrounding admin routes: these endpoints read and write
                 * credential material, and `test` reaches out to a third party
                 * on each call, so it must not be usable as a request amplifier.
                 */
                Route::prefix('integrations')->name('integrations.')->middleware('throttle:30,1')->group(function () {
                    Route::get('/',                    [AdminIntegrationController::class, 'index'])->name('index');
                    Route::get('/{provider}',          [AdminIntegrationController::class, 'show'])->where('provider', '[a-z0-9_-]+')->name('show');
                    Route::put('/{provider}',          [AdminIntegrationController::class, 'update'])->where('provider', '[a-z0-9_-]+')->name('update');
                    Route::post('/{provider}/test',    [AdminIntegrationController::class, 'test'])->where('provider', '[a-z0-9_-]+')->middleware('throttle:admin-test')->name('test');
                    Route::delete('/{provider}',       [AdminIntegrationController::class, 'destroy'])->where('provider', '[a-z0-9_-]+')->name('destroy');
                });

                Route::prefix('music')->name('music.')->group(function () {
                    Route::get('/stats',           [AdminMusicController::class, 'stats'])->name('stats');
                    Route::get('/',                [AdminMusicController::class, 'index'])->name('index');
                    Route::post('/',               [AdminMusicController::class, 'store'])->name('store');
                    Route::get('/{id}',            [AdminMusicController::class, 'show'])->where('id', '[0-9]+')->name('show');
                    Route::put('/{id}',            [AdminMusicController::class, 'update'])->where('id', '[0-9]+')->name('update');
                    Route::delete('/{id}',         [AdminMusicController::class, 'destroy'])->where('id', '[0-9]+')->name('destroy');
                    Route::post('/{id}/publish',   [AdminMusicController::class, 'publish'])->where('id', '[0-9]+')->name('publish');
                    Route::post('/{id}/unpublish', [AdminMusicController::class, 'unpublish'])->where('id', '[0-9]+')->name('unpublish');
                    Route::post('/{id}/duplicate', [AdminMusicController::class, 'duplicate'])->where('id', '[0-9]+')->name('duplicate');

                    /* The genre / mood / language vocabulary. Declared BEFORE
                       nothing in particular, but note the numeric constraint on
                       the routes above: without it "/music/taxonomy" would be
                       captured by "/music/{id}". */
                    Route::prefix('taxonomy')->name('taxonomy.')->group(function () {
                        Route::get('/{kind}',         [\App\Http\Controllers\Api\Admin\AdminMusicTaxonomyController::class, 'index'])->name('index');
                        Route::post('/{kind}',        [\App\Http\Controllers\Api\Admin\AdminMusicTaxonomyController::class, 'store'])->name('store');
                        Route::put('/{kind}/{id}',    [\App\Http\Controllers\Api\Admin\AdminMusicTaxonomyController::class, 'update'])->where('id', '[0-9]+')->name('update');
                        Route::delete('/{kind}/{id}', [\App\Http\Controllers\Api\Admin\AdminMusicTaxonomyController::class, 'destroy'])->where('id', '[0-9]+')->name('destroy');
                    });
                });

                Route::get('/stats',            [AdminApiController::class, 'dashboardStats'])->name('stats');
                Route::get('/stats/users',      [AdminApiController::class, 'userStats'])->name('stats.users');
                Route::get('/stats/videos',     [AdminApiController::class, 'videoStats'])->name('stats.videos');
                Route::get('/stats/reports',    [AdminApiController::class, 'reportStats'])->name('stats.reports');
                Route::get('/action-logs',      [AdminApiController::class, 'actionLogs'])->name('action-logs');
                Route::get('/videos',           [AdminApiController::class, 'videos'])->name('videos.index');
                Route::post('/users/{id}/ban',  [AdminApiController::class, 'banUser'])->name('users.ban');
                Route::post('/users/{id}/unban',[AdminApiController::class, 'unbanUser'])->name('users.unban');
                Route::delete('/videos/{id}',   [AdminApiController::class, 'removeVideo'])->name('videos.remove');
                // AdminApiController::actionReport used to be registered here too, at the
                // exact same POST /reports/{id}/action path as AdminReportsController::action
                // below - Laravel matches the first-registered route for an identical
                // method+URI, so every report-action request (dismiss/warn/remove/ban) has
                // been silently going to THIS one instead, which only ever understood
                // VideoReport (VideoReport::with(['video','video.user'])->findOrFail($id)) -
                // any non-video report id either 404'd or, worse, matched an unrelated
                // VideoReport row that happens to share that id and actioned/banned
                // whatever THAT pointed at. AdminReportsController::action is a strict
                // superset (same video ban/remove logic, plus every other type, plus real
                // type-scoping), so the fix is removing this duplicate route, not the
                // controller method - it's still there, just unreferenced now.

                // ── Admin Messages management ─────────────────────────────
                Route::prefix('messages')->name('messages.')->group(function () {
                    Route::get('/stats',                                [AdminMessagesController::class, 'stats'])->name('stats');
                    Route::get('/conversations',                        [AdminMessagesController::class, 'conversations'])->name('conversations');
                    Route::get('/conversations/{id}/messages',          [AdminMessagesController::class, 'messages'])->name('messages');
                    Route::get('/conversations/{id}/activity',          [AdminMessagesController::class, 'activity'])->name('activity');
                    Route::post('/conversations/{id}/settings',         [AdminMessagesController::class, 'updateSettings'])->name('settings');
                    Route::post('/conversations/{id}/action',           [AdminMessagesController::class, 'action'])->name('action');
                    Route::post('/{messageId}/flag',                    [AdminMessagesController::class, 'flagMessage'])->name('flag');
                    Route::delete('/{messageId}',                       [AdminMessagesController::class, 'deleteMessage'])->name('delete');
                    Route::get('/conversations/{id}/export',            [AdminMessagesController::class, 'exportChat'])->name('export');
                });

                // ── User 360 profile ─────────────────────────────────────
                Route::get('/users/{id}/360',            [AdminUser360Controller::class, 'show'])->name('users.360');
                Route::get('/users/{id}/content',        [AdminUser360Controller::class, 'getUserContent'])->name('users.content');
                Route::get('/users/{id}/risk-health',    [AdminUser360Controller::class, 'riskHealth'])->name('users.risk-health');
                Route::get('/users/{id}/quick-stats',    [AdminUser360Controller::class, 'quickStats'])->name('users.quick-stats');
                Route::get('/users/{id}/analytics',      [AdminUser360Controller::class, 'analytics'])->name('users.analytics');
                Route::get('/users/{id}/reports',        [AdminUser360Controller::class, 'reports'])->name('users.reports');
                Route::get('/users/{id}/security',       [AdminUser360Controller::class, 'security'])->name('users.security');
                Route::post('/users/{id}/security/action', [AdminUser360Controller::class, 'securityAction'])->name('users.security.action');
                Route::put('/users/{id}/moderation',     [AdminUser360Controller::class, 'updateModeration'])->name('users.moderation');
                Route::put('/users/{id}/permissions',    [AdminUser360Controller::class, 'updatePermissions'])->name('users.permissions');
                Route::put('/users/{id}/safety',         [AdminUser360Controller::class, 'updateSafety'])->name('users.safety');
                Route::post('/users/{id}/strike',        [AdminUser360Controller::class, 'addStrike'])->name('users.strike');
                Route::post('/users/{id}/issue-warning', [AdminUser360Controller::class, 'issueWarning'])->name('users.issue-warning');
                Route::post('/users/{id}/notes',               [AdminUser360Controller::class, 'addNote'])->name('users.notes.store');
                Route::patch('/users/{id}/notes/{noteId}',   [AdminUser360Controller::class, 'updateNote'])->name('users.notes.update');
                Route::delete('/users/{id}/notes/{noteId}',  [AdminUser360Controller::class, 'deleteNote'])->name('users.notes.destroy');
                Route::post('/users/{id}/message',       [AdminUser360Controller::class, 'messageUser'])->name('users.message');
                Route::put('/users/{id}/edit',           [AdminUser360Controller::class, 'editUser'])->name('users.edit');
                Route::post('/users/{id}/upload-avatar', [AdminUser360Controller::class, 'uploadAvatar'])->name('users.upload-avatar');

                // Finance & Tax tab: tax forms (approve/reject) + advance funds.
                Route::get('/users/{id}/finance',                 [AdminUser360Controller::class, 'finance'])->name('users.finance');
                Route::patch('/users/{id}/tax-forms/{formId}',    [AdminUser360Controller::class, 'updateTaxForm'])->whereNumber('formId')->name('users.tax-forms.update');
                Route::post('/users/{id}/tax-forms/request',      [AdminUser360Controller::class, 'requestTaxInfo'])->name('users.tax-forms.request');
                Route::post('/users/{id}/advance-funds',          [AdminUser360Controller::class, 'addAdvanceFunds'])->name('users.advance-funds.add');

                // Monetization tab: earnings, payouts, methods, controls + payout requests.
                Route::get('/users/{id}/monetization',            [AdminUser360Controller::class, 'userMonetization'])->name('users.monetization');
                Route::patch('/users/{id}/monetization/status',   [AdminUser360Controller::class, 'updateMonetizationStatus'])->name('users.monetization.status');
                Route::patch('/users/{id}/monetization/settings', [AdminUser360Controller::class, 'updateMonetizationSetting'])->name('users.monetization.settings');
                Route::post('/users/{id}/monetization/note',      [AdminUser360Controller::class, 'saveMonetizationNote'])->name('users.monetization.note');
                Route::patch('/users/{id}/payouts/{payoutId}',    [AdminUser360Controller::class, 'updatePayoutRequest'])->whereNumber('payoutId')->name('users.payouts.update');

                // Ads & Control tab: ad account + campaigns + ads.
                Route::get('/users/{id}/ads',                     [AdminUser360Controller::class, 'adsControl'])->name('users.ads');
                Route::patch('/users/{id}/ad-account',            [AdminUser360Controller::class, 'updateAdAccountStatus'])->name('users.ad-account.update');
                Route::patch('/users/{id}/ad-account/control',    [AdminUser360Controller::class, 'adAccountControl'])->name('users.ad-account.control');
                Route::post('/users/{id}/ads/{creativeId}/status',[AdminUser360Controller::class, 'updateAdStatus'])->whereNumber('creativeId')->name('users.ads.status');

                // ── Content restrictions (with date-based expiry) ─────────
                Route::get('/users/{id}/restrictions',   [AdminRestrictionsController::class, 'getRestrictions'])->name('users.restrictions.show');
                Route::patch('/users/{id}/restrictions', [AdminRestrictionsController::class, 'updateRestrictions'])->name('users.restrictions.update');

                // ── User preferences detail endpoints ─────────────────────
                Route::get('/users/{id}/blocked-users',                        [AdminUser360Controller::class, 'getBlockedUsers'])->name('users.blocked');
                Route::get('/users/{id}/hidden-words',                         [AdminUser360Controller::class, 'getHiddenWords'])->name('users.hidden-words');
                Route::delete('/users/{id}/hidden-words/{wid}',                [AdminUser360Controller::class, 'deleteHiddenWord'])->name('users.hidden-words.delete');
                Route::get('/users/{id}/data-requests',                        [AdminUser360Controller::class, 'getDataRequests'])->name('users.data-requests');
                Route::patch('/users/{id}/data-requests/{rid}',                [AdminUser360Controller::class, 'updateDataRequest'])->name('users.data-requests.update');
                Route::get('/users/{id}/deletion-requests',                    [AdminUser360Controller::class, 'getDeletionRequests'])->name('users.deletion-requests');
                Route::patch('/users/{id}/deletion-requests/{rid}',            [AdminUser360Controller::class, 'updateDeletionRequest'])->name('users.deletion-requests.update');

                // ── User management ──────────────────────────────────────
                Route::get('/users',                     [AdminUserController::class, 'index'])->name('users.index');
                Route::get('/users/{id}',                [AdminUserController::class, 'show'])->name('users.show');
                Route::put('/users/{id}',                [AdminUserController::class, 'update'])->name('users.update');
                Route::post('/users/{id}/promote',       [AdminUserController::class, 'promote'])->name('users.promote');
                Route::post('/users/{id}/verify',        [AdminUserController::class, 'verify'])->name('users.verify');
                Route::post('/users/{id}/unverify',      [AdminUserController::class, 'unverify'])->name('users.unverify');
                Route::post('/users/{id}/warn',          [AdminUserController::class, 'warn'])->name('users.warn');
                Route::post('/users/{id}/suspend',       [AdminUserController::class, 'suspend'])->name('users.suspend');
                Route::post('/users/{id}/unsuspend',     [AdminUserController::class, 'unsuspend'])->name('users.unsuspend');
                Route::post('/users/{id}/reset-password',[AdminUserController::class, 'resetPassword'])->name('users.reset-password');
                Route::delete('/users/{id}',             [AdminUserController::class, 'destroy'])->name('users.destroy');

                // ── Video management ──────────────────────────────────────
                Route::get('/videos/stats',              [AdminVideoController::class, 'stats'])->name('videos.stats');
                Route::get('/videos/{id}',               [AdminVideoController::class, 'show'])->name('videos.detail');
                Route::post('/videos/{id}/remove',       [AdminVideoController::class, 'remove'])->name('videos.remove-post');
                Route::post('/videos/{id}/restore',      [AdminVideoController::class, 'restore'])->name('videos.restore');
                Route::post('/videos/{id}/feature',      [AdminVideoController::class, 'feature'])->name('videos.feature');
                Route::put('/videos/{id}',               [AdminVideoController::class, 'update'])->name('videos.update');
                Route::get('/videos/{id}/edit-data',         [AdminVideoController::class, 'editData'])->name('videos.edit-data');
                Route::patch('/videos/{id}/settings',        [AdminVideoController::class, 'updateSettings'])->name('videos.settings');
                Route::patch('/videos/{id}/monetization',    [AdminVideoController::class, 'updateMonetization'])->name('videos.monetization');
                Route::patch('/videos/{id}/visibility',      [AdminVideoController::class, 'updateVisibility'])->name('videos.visibility');
                Route::patch('/videos/{id}/advanced',        [AdminVideoController::class, 'updateAdvanced'])->name('videos.advanced');
                Route::post('/videos/{id}/unpublish',        [AdminVideoController::class, 'unpublish'])->name('videos.unpublish');
                Route::post('/videos/{id}/run-safety-check', [AdminVideoController::class, 'runSafetyCheck'])->name('videos.safety-check');
                Route::post('/videos/{id}/reprocess',        [AdminVideoController::class, 'reprocess'])->name('videos.reprocess');
                Route::delete('/videos/{id}/permanent',      [AdminVideoController::class, 'permanentDelete'])->name('videos.permanent-delete');

                // ── Reports ───────────────────────────────────────────────
                Route::get('/reports',                   [AdminReportsController::class, 'index'])->name('reports.index');
                Route::get('/reports/stats',             [AdminReportsController::class, 'stats'])->name('reports.stats');
                Route::get('/reports/{id}',              [AdminReportsController::class, 'show'])->name('reports.show');
                Route::post('/reports/{id}/action',      [AdminReportsController::class, 'action'])->name('reports.action-v2');

                // ── Verification ──────────────────────────────────────────
                Route::get('/verification',              [AdminVerificationController::class, 'index'])->name('verification.index');
                Route::get('/verification/{id}',         [AdminVerificationController::class, 'show'])->name('verification.show');
                Route::post('/verification/{id}/approve',[AdminVerificationController::class, 'approve'])->name('verification.approve');
                Route::post('/verification/{id}/reject', [AdminVerificationController::class, 'reject'])->name('verification.reject');
                Route::post('/verification/{id}/revoke', [AdminVerificationController::class, 'revoke'])->name('verification.revoke');

                // ── Payment gateway settings ─────────────────────────────
                Route::get('/payment-settings',                       [AdminPaymentSettingsController::class, 'index'])->name('payment-settings.index');
                Route::post('/payment-settings',                      [AdminPaymentSettingsController::class, 'update'])->name('payment-settings.update');
                Route::post('/payment-settings/paypal/test',          [AdminPaymentSettingsController::class, 'testPaypal'])->name('payment-settings.paypal.test');
                Route::post('/payment-settings/stripe/test',          [AdminPaymentSettingsController::class, 'testStripe'])->name('payment-settings.stripe.test');

                // ── Email & OTP settings ─────────────────────────────────
                Route::get('/email-settings',            [AdminEmailSettingsController::class, 'index'])->name('email-settings.index');
                Route::post('/email-settings/email',     [AdminEmailSettingsController::class, 'updateEmail'])->name('email-settings.email');
                Route::post('/email-settings/otp',       [AdminEmailSettingsController::class, 'updateOtp'])->name('email-settings.otp');
                Route::post('/email-settings/test',      [AdminEmailSettingsController::class, 'testEmail'])->name('email-settings.test');

                // ── Settings & feature flags ──────────────────────────────
                Route::get('/settings',                  [AdminSettingsController::class, 'index'])->name('settings.index');
                Route::post('/settings',                 [AdminSettingsController::class, 'update'])->name('settings.update');
                Route::get('/settings/groups',           [AdminSettingsController::class, 'groups'])->name('settings.groups');

                /* ── Platform settings (declared schema, grouped save) ─────
                   Separate from the generic /settings key-value editor above:
                   everything here is constrained to
                   App\Services\PlatformSettings' schema, so a setting cannot
                   be surfaced in the panel without a verified consumer. */
                Route::prefix('platform-settings')->name('platform-settings.')->group(function () {
                    Route::get('/site',        [\App\Http\Controllers\Api\Admin\AdminPlatformSettingsController::class, 'site'])->name('site');
                    Route::put('/site',        [\App\Http\Controllers\Api\Admin\AdminPlatformSettingsController::class, 'updateSite'])->name('site.update');
                    Route::post('/site/reset', [\App\Http\Controllers\Api\Admin\AdminPlatformSettingsController::class, 'resetSite'])->name('site.reset');
                    Route::post('/site/clear-cache', [\App\Http\Controllers\Api\Admin\AdminPlatformSettingsController::class, 'clearSiteCache'])->name('site.clear-cache');
                });

                // ── Settings → Monetization Enable and Disable ────────────
                Route::get('/monetization-programs',              [AdminMonetizationProgramController::class, 'index'])->name('monetization-programs.index');
                Route::patch('/monetization-programs/master',     [AdminMonetizationProgramController::class, 'setMaster'])->name('monetization-programs.master');
                Route::put('/monetization-programs/{key}',        [AdminMonetizationProgramController::class, 'update'])->name('monetization-programs.update');
                Route::patch('/monetization-programs/{key}/mode', [AdminMonetizationProgramController::class, 'setMode'])->name('monetization-programs.mode');
                Route::put('/platform-requirements/{key}',        [AdminMonetizationProgramController::class, 'updateBaseline'])->name('platform-requirements.update');

                // Social login OAuth credentials (Google / Apple / Facebook / TikTok)
                Route::get('/social-login',              [AdminSocialLoginController::class, 'index'])->name('social-login.index');
                Route::post('/social-login',             [AdminSocialLoginController::class, 'update'])->name('social-login.update');
                Route::post('/social-login/{provider}/test', [AdminSocialLoginController::class, 'test'])
                    ->where('provider', '[a-z]+')->middleware('throttle:admin-test')->name('social-login.test');
                Route::get('/features',                  [AdminSettingsController::class, 'features'])->name('features.index');
                Route::post('/features/{key}',           [AdminSettingsController::class, 'toggleFeature'])->name('features.toggle');
                Route::get('/system-health',             [AdminSettingsController::class, 'systemHealth'])->name('system-health');

                // ── Global Reelsoo Control ──────────────────────────────────
                Route::prefix('global-controls')->name('global-controls.')->group(function () {
                    Route::get('/',                    [AdminGlobalControlsController::class, 'index'])
                        ->middleware('permission:global_controls.view')->name('index');
                    Route::patch('/{key}',              [AdminGlobalControlsController::class, 'update'])
                        ->middleware('permission:global_controls.edit')->name('update');
                    Route::post('/category/{category}', [AdminGlobalControlsController::class, 'bulkCategory'])
                        ->middleware('permission:global_controls.edit')->name('bulk-category');
                    Route::get('/activity',             [AdminGlobalControlsController::class, 'activity'])
                        ->middleware('permission:global_controls.view')->name('activity');
                    Route::post('/actions/stop-live-streams', [AdminGlobalControlsController::class, 'stopActiveLiveStreams'])
                        ->middleware('permission:global_controls.emergency')->name('actions.stop-live-streams');
                });
                Route::get('/security/rate-limits',      [AdminSecurityController::class, 'rateLimits'])->name('security.rate-limits');
                Route::post('/security/rate-limits/{id}/unblock', [AdminSecurityController::class, 'unblock'])->name('security.rate-limits.unblock');
                Route::get('/security/logs',             [AdminSecurityController::class, 'logs'])->name('security.logs');

                // Country override - bypasses the 60-day lock + continuous check.
                // Always audit-logged in country_admin_override_logs.
                Route::post('/users/{id}/country-override', [CountryController::class, 'adminOverride'])->name('users.country-override');

                // ── CMS pages ────────────────────────────────────────────
                Route::get('/cms',           [AdminCmsController::class, 'index'])->name('cms.index');
                Route::post('/cms',          [AdminCmsController::class, 'store'])->name('cms.store');
                Route::get('/cms/{slug}',    [AdminCmsController::class, 'show'])->name('cms.show');
                Route::put('/cms/{slug}',    [AdminCmsController::class, 'update'])->name('cms.update');
                Route::delete('/cms/{slug}', [AdminCmsController::class, 'destroy'])->name('cms.destroy');

                // ── Menu management ───────────────────────────────────────
                Route::get('/menus',         [AdminMenuController::class, 'index'])->name('menus.index');
                Route::put('/menus/{id}',    [AdminMenuController::class, 'update'])->name('menus.update');
                Route::post('/menus/reorder',[AdminMenuController::class, 'bulkReorder'])->name('menus.reorder');

                // ── Hashtags overview ─────────────────────────────────────
                /* Was an inline closure that could only list and sort. The
                   controller keeps that exact response shape and adds the
                   measured trending count plus the moderation actions. */
                Route::get('/hashtags',              [\App\Http\Controllers\Api\Admin\AdminHashtagController::class, 'index'])->name('hashtags.index');
                Route::post('/hashtags/bulk',        [\App\Http\Controllers\Api\Admin\AdminHashtagController::class, 'bulk'])->name('hashtags.bulk');
                Route::post('/hashtags/{id}/action', [\App\Http\Controllers\Api\Admin\AdminHashtagController::class, 'action'])->whereNumber('id')->name('hashtags.action');

                // ── Notification broadcast ────────────────────────────────
                Route::post('/notifications/broadcast', function (\Illuminate\Http\Request $req) {
                    $req->validate(['title' => ['required', 'string', 'max:100'], 'body' => ['required', 'string', 'max:500'], 'target' => ['nullable', 'in:all,creators,users']]);
                    $target = $req->input('target', 'all');
                    $query  = \App\Models\User::where('is_banned', false);
                    if ($target === 'creators') $query->where('role', 'creator');
                    if ($target === 'users')    $query->where('role', 'user');
                    $count  = $query->count();
                    \App\Models\AdminActionLog::record(
                        admin: $req->user(),
                        action: 'broadcast_notification',
                        target: null,
                        description: "Broadcast '{$req->title}' to {$count} {$target} users",
                    );
                    return response()->json(['success' => true, 'message' => "Notification queued for {$count} users.", 'count' => $count]);
                })->name('notifications.broadcast');

                // Moderation admin panel
                Route::prefix('moderation')->name('moderation.')->group(function () {
                    Route::get('/stats',           [AdminModerationController::class, 'stats'])->name('stats');
                    Route::get('/scanner-health',     [AdminModerationController::class, 'scannerHealth'])->name('scanner-health');
                    Route::post('/sightengine-test', [AdminModerationController::class, 'sightengineTest'])->name('sightengine-test');
                    Route::get('/settings',          [AdminModerationController::class, 'settings'])->name('settings');
                    Route::post('/settings',         [AdminModerationController::class, 'updateSettings'])->name('settings.update');
                    Route::get('/logs',            [AdminModerationController::class, 'logs'])->name('logs');
                    Route::get('/pending',         [AdminModerationController::class, 'pending'])->name('pending');
                    Route::get('/approved',        [AdminModerationController::class, 'approved'])->name('approved');
                    Route::get('/rejected',        [AdminModerationController::class, 'rejected'])->name('rejected');
                    Route::get('/{contentId}',     [AdminModerationController::class, 'show'])->name('show');
                    Route::post('/{contentId}/decision', [AdminModerationController::class, 'decide'])->name('decide');
                    Route::post('/{contentId}/rescan',   [AdminModerationController::class, 'rescan'])->name('rescan');
                });

                // Platform monitoring (read-only health + metrics)
                Route::prefix('monitoring')->name('monitoring.')->group(function () {
                    Route::get('/overview', [AdminMonitoringController::class, 'overview'])->name('overview');
                    Route::get('/redis',    [AdminMonitoringController::class, 'redis'])->name('redis');
                    Route::get('/database', [AdminMonitoringController::class, 'database'])->name('database');
                    Route::get('/queue',    [AdminMonitoringController::class, 'queue'])->name('queue');
                    Route::get('/realtime', [AdminMonitoringController::class, 'realtime'])->name('realtime');
                    Route::get('/logs',     [AdminMonitoringController::class, 'logs'])->name('logs');
                    // API latency percentiles + queue backlog + connection budget,
                    // the three numbers that say whether the platform is healthy.
                    Route::get('/metrics',  [AdminMonitoringController::class, 'metrics'])->name('metrics');
                });
            });
    });
});
