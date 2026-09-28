<?php

namespace App\Services;

use App\Models\AdminCoinSetting;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class PayPalService
{
    private string $baseUrl;
    private string $clientId;
    private string $clientSecret;

    public function __construct()
    {
        // DB values take precedence over .env so admins can update without a redeploy.
        $mode             = AdminCoinSetting::getValue('paypal_mode') ?: config('services.paypal.mode', 'sandbox');
        $this->clientId     = AdminCoinSetting::getValue('paypal_client_id') ?: config('services.paypal.client_id', '');
        $this->clientSecret = AdminCoinSetting::getValue('paypal_client_secret') ?: config('services.paypal.client_secret', '');

        $this->baseUrl = $mode === 'live'
            ? 'https://api-m.paypal.com'
            : 'https://api-m.sandbox.paypal.com';
    }

    /**
     * Bounds on every PayPal call.
     *
     * These were the only outbound HTTP calls in the app with no timeout at
     * all, so each fell back to the client default of 30s. That is a long time
     * to hold one of a fixed number of PHP-FPM workers, and it sits directly in
     * a user-facing subscription purchase - a slow PayPal was enough to consume
     * a meaningful share of the API's concurrency.
     *
     * Capture gets a longer budget than the rest on purpose: it is the call
     * that moves money, so giving up early risks a charge whose result we never
     * read. The other two are safely retryable by the user.
     */
    private const CONNECT_TIMEOUT = 5;
    private const TIMEOUT         = 15;
    private const CAPTURE_TIMEOUT = 30;

    private function accessTokenCacheKey(): string
    {
        return 'paypal_access_token_' . md5($this->clientId);
    }

    private function getAccessToken(): string
    {
        return Cache::remember($this->accessTokenCacheKey(), 3000, function () {
            $response = Http::withBasicAuth($this->clientId, $this->clientSecret)
                ->connectTimeout(self::CONNECT_TIMEOUT)
                ->timeout(self::TIMEOUT)
                ->asForm()
                ->post("{$this->baseUrl}/v1/oauth2/token", ['grant_type' => 'client_credentials']);

            if (!$response->successful()) {
                throw new \RuntimeException('PayPal auth failed: ' . $response->body());
            }

            return $response->json('access_token');
        });
    }

    /** Flush the cached access token (call after credential change). */
    public static function flushTokenCache(): void
    {
        // Flush all possible token cache keys - safest on credential change.
        $keys = AdminCoinSetting::whereIn('key', ['paypal_client_id'])
            ->pluck('value')
            ->filter()
            ->map(fn ($id) => 'paypal_access_token_' . md5($id));

        foreach ($keys as $key) {
            Cache::forget($key);
        }
    }

    /** Returns true when credentials are configured and the PayPal auth endpoint responds OK. */
    public function testConnection(): bool
    {
        if (!$this->clientId || !$this->clientSecret) {
            return false;
        }

        try {
            Cache::forget($this->accessTokenCacheKey());
            $this->getAccessToken();
            return true;
        } catch (\Throwable) {
            return false;
        }
    }

    /** Create a PayPal order and return its ID. */
    public function createOrder(float $amount, string $currency, string $reference, string $description): string
    {
        $response = Http::withToken($this->getAccessToken())
            ->connectTimeout(self::CONNECT_TIMEOUT)
            ->timeout(self::TIMEOUT)
            ->acceptJson()
            ->post("{$this->baseUrl}/v2/checkout/orders", [
                'intent'         => 'CAPTURE',
                'purchase_units' => [[
                    'reference_id' => $reference,
                    'description'  => $description,
                    'amount'       => [
                        'currency_code' => strtoupper($currency),
                        'value'         => number_format($amount, 2, '.', ''),
                    ],
                ]],
                'application_context' => [
                    'user_action' => 'PAY_NOW',
                    'return_url'  => config('app.url'),
                    'cancel_url'  => config('app.url'),
                ],
            ]);

        if (!$response->successful()) {
            throw new \RuntimeException('PayPal create order failed: ' . $response->body());
        }

        return $response->json('id');
    }

    /** Capture a PayPal order after buyer approval. Returns the capture data array. */
    public function captureOrder(string $paypalOrderId): array
    {
        $response = Http::withToken($this->getAccessToken())
            ->connectTimeout(self::CONNECT_TIMEOUT)
            ->timeout(self::CAPTURE_TIMEOUT)
            ->acceptJson()
            ->contentType('application/json')
            ->post("{$this->baseUrl}/v2/checkout/orders/{$paypalOrderId}/capture", (object)[]);

        if (!$response->successful()) {
            throw new \RuntimeException('PayPal capture failed: ' . $response->body());
        }

        return $response->json();
    }
}
