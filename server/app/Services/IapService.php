<?php

namespace App\Services;

use App\Models\AdminCoinSetting;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Apple In-App Purchase and Google Play Billing receipt verification.
 *
 * The store SDK on the device hands us a receipt. That receipt is NOT proof of anything
 * until Apple or Google confirms it - a client can send any string it likes. This service
 * is the only thing that decides whether a purchase is real, and it always asks the store.
 *
 * Credentials come from the admin panel (Settings → Payment Gateways → Apps) rather than
 * .env, so they can be rotated without a deploy.
 */
class IapService
{
    /* ── Apple ─────────────────────────────────────────────────────────────── */

    private const APPLE_PROD    = 'https://buy.itunes.apple.com/verifyReceipt';
    private const APPLE_SANDBOX = 'https://sandbox.itunes.apple.com/verifyReceipt';

    /**
     * Verify an App Store receipt.
     *
     * @param  string $receipt     base64 receipt from the device
     * @param  string $productId   the product we EXPECT - a receipt for a cheaper product
     *                             must not unlock a more expensive one
     * @return array{transaction_id:string, product_id:string, expires_at:?int, raw:array}
     */
    public function verifyApple(string $receipt, string $productId): array
    {
        $secret = (string) AdminCoinSetting::getValue('apple_shared_secret', '');
        if ($secret === '') {
            throw new RuntimeException('Apple in-app purchases are not configured.');
        }

        $payload = [
            'receipt-data'            => $receipt,
            'password'                => $secret,
            'exclude-old-transactions'=> true,
        ];

        // Always try production FIRST. Apple's own guidance: a sandbox receipt sent to
        // production comes back 21007, and you retry against sandbox. Doing it the other
        // way round means real purchases get validated against sandbox and silently fail.
        $res = Http::timeout(20)->post(self::APPLE_PROD, $payload)->json();

        if (($res['status'] ?? null) === 21007) {
            $res = Http::timeout(20)->post(self::APPLE_SANDBOX, $payload)->json();
        }

        $status = $res['status'] ?? -1;
        if ($status !== 0) {
            throw new RuntimeException('Apple rejected this receipt (status ' . $status . ').');
        }

        // Newest first: latest_receipt_info for auto-renewables, in_app otherwise.
        $lines = $res['latest_receipt_info'] ?? $res['receipt']['in_app'] ?? [];
        if (! is_array($lines) || $lines === []) {
            throw new RuntimeException('This receipt contains no purchase.');
        }

        usort($lines, fn ($a, $b) => (int) ($b['purchase_date_ms'] ?? 0) <=> (int) ($a['purchase_date_ms'] ?? 0));

        $match = null;
        foreach ($lines as $line) {
            if (($line['product_id'] ?? null) === $productId) {
                $match = $line;
                break;
            }
        }

        // A receipt is only evidence for the product it is actually FOR. Without this, a
        // real receipt for the $5 plan would unlock the $20 one.
        if (! $match) {
            throw new RuntimeException('This receipt is not for the plan you selected.');
        }

        $expiresMs = isset($match['expires_date_ms']) ? (int) $match['expires_date_ms'] : null;

        if ($expiresMs !== null && $expiresMs < now()->getTimestampMs()) {
            throw new RuntimeException('This subscription has already expired.');
        }

        return [
            'transaction_id' => (string) ($match['original_transaction_id'] ?? $match['transaction_id'] ?? ''),
            'product_id'     => (string) $match['product_id'],
            'expires_at'     => $expiresMs ? intdiv($expiresMs, 1000) : null,
            'raw'            => $match,
        ];
    }

    /* ── Google ────────────────────────────────────────────────────────────── */

    /**
     * Verify a Google Play purchase token.
     *
     * @return array{transaction_id:string, product_id:string, expires_at:?int, raw:array}
     */
    public function verifyGoogle(string $purchaseToken, string $productId): array
    {
        $packageName = (string) AdminCoinSetting::getValue('google_package_name', '');
        $saJson      = (string) AdminCoinSetting::getValue('google_service_account_json', '');

        if ($packageName === '' || $saJson === '') {
            throw new RuntimeException('Google Play billing is not configured.');
        }

        $token = $this->googleAccessToken($saJson);

        // subscriptionsv2 is the current endpoint for auto-renewing products, which is what
        // a monthly badge is. It reports the whole subscription state, not just a purchase.
        $url = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/"
             . rawurlencode($packageName)
             . "/purchases/subscriptionsv2/tokens/" . rawurlencode($purchaseToken);

        $res = Http::withToken($token)->timeout(20)->get($url);

        if (! $res->successful()) {
            throw new RuntimeException('Google rejected this purchase (' . $res->status() . ').');
        }

        $body  = $res->json();
        $state = $body['subscriptionState'] ?? '';

        // SUBSCRIPTION_STATE_IN_GRACE_PERIOD still means they paid and are entitled.
        $ok = in_array($state, [
            'SUBSCRIPTION_STATE_ACTIVE',
            'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
        ], true);

        if (! $ok) {
            throw new RuntimeException('This subscription is not active (' . $state . ').');
        }

        $line       = $body['lineItems'][0] ?? [];
        $gotProduct = (string) ($line['productId'] ?? '');

        if ($gotProduct !== $productId) {
            throw new RuntimeException('This purchase is not for the plan you selected.');
        }

        $expiry = isset($line['expiryTime']) ? strtotime((string) $line['expiryTime']) : null;

        return [
            // The order id is the stable, unique reference for the purchase.
            'transaction_id' => (string) ($body['latestOrderId'] ?? $purchaseToken),
            'product_id'     => $gotProduct,
            'expires_at'     => $expiry ?: null,
            'raw'            => $body,
        ];
    }

    /**
     * Service-account OAuth: sign a JWT with the private key, swap it for an access token.
     *
     * Done by hand with openssl rather than pulling in google/apiclient - it is one RS256
     * signature and one POST, and the SDK is a large dependency for that.
     */
    private function googleAccessToken(string $saJson): string
    {
        $sa = json_decode($saJson, true);

        if (! is_array($sa) || empty($sa['client_email']) || empty($sa['private_key'])) {
            throw new RuntimeException('The Google service account JSON is not valid.');
        }

        $now = time();

        $header = ['alg' => 'RS256', 'typ' => 'JWT'];
        $claims = [
            'iss'   => $sa['client_email'],
            'scope' => 'https://www.googleapis.com/auth/androidpublisher',
            'aud'   => 'https://oauth2.googleapis.com/token',
            'iat'   => $now,
            'exp'   => $now + 3600,
        ];

        $signingInput = $this->b64url(json_encode($header)) . '.' . $this->b64url(json_encode($claims));

        $key = openssl_pkey_get_private($sa['private_key']);
        if (! $key) {
            throw new RuntimeException('The Google service account private key could not be read.');
        }

        $signature = '';
        if (! openssl_sign($signingInput, $signature, $key, OPENSSL_ALGO_SHA256)) {
            throw new RuntimeException('Failed to sign the Google auth request.');
        }

        $jwt = $signingInput . '.' . $this->b64url($signature);

        $res = Http::asForm()->timeout(20)->post('https://oauth2.googleapis.com/token', [
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion'  => $jwt,
        ]);

        if (! $res->successful() || ! ($res->json()['access_token'] ?? null)) {
            throw new RuntimeException('Google refused the service account credentials.');
        }

        return (string) $res->json()['access_token'];
    }

    private function b64url(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    /* ── Products ──────────────────────────────────────────────────────────── */

    /**
     * Store product id for a plan, per platform.
     *
     * The device buys a PRODUCT; the server thinks in plans. These are configured in the
     * admin panel because they must match what was created in App Store Connect and the
     * Play Console exactly, and those are named by whoever set them up.
     */
    public function productIdFor(string $platform, string $planId): ?string
    {
        $prefix = $platform === 'ios' ? 'apple' : 'google';
        $value  = AdminCoinSetting::getValue("{$prefix}_product_{$planId}", '');

        return $value !== '' ? (string) $value : null;
    }

    public function isEnabled(string $platform): bool
    {
        return $platform === 'ios'
            ? (bool) AdminCoinSetting::getValue('apple_iap_enabled', 0)
            : (bool) AdminCoinSetting::getValue('google_iap_enabled', 0);
    }

    /** Is the coin store switched on for this platform? (separate from the badge store) */
    public function coinsEnabled(string $platform): bool
    {
        return $platform === 'ios'
            ? (bool) AdminCoinSetting::getValue('apple_coin_iap_enabled', 0)
            : (bool) AdminCoinSetting::getValue('google_coin_iap_enabled', 0);
    }

    /** Is Premium sellable in the app on this platform? (separate again - the three
     *  stores are switched on independently, because they are configured, reviewed
     *  and can break independently.) */
    public function subsEnabled(string $platform): bool
    {
        return $platform === 'ios'
            ? (bool) AdminCoinSetting::getValue('apple_sub_iap_enabled', 0)
            : (bool) AdminCoinSetting::getValue('google_sub_iap_enabled', 0);
    }

    /**
     * Verify an App Store receipt for a CONSUMABLE (a coin pack).
     *
     * Why this is not verifyApple():
     *
     * verifyApple() keys on `original_transaction_id`, which is right for a subscription -
     * every renewal of one subscription shares it, and that is exactly the identity you
     * want. Coins are consumables you buy over and over, and repeat purchases of the SAME
     * product also share an original_transaction_id. Using it here would make a user's
     * second purchase of a pack look like a duplicate of their first: they would be charged
     * and credited nothing.
     *
     * So this returns the per-purchase `transaction_id`, which is unique to each buy, and
     * is what the caller stores as the idempotency key.
     *
     * @return array{transaction_id:string, product_id:string, quantity:int, raw:array}
     */
    public function verifyAppleConsumable(string $receipt, string $productId): array
    {
        $secret = (string) AdminCoinSetting::getValue('apple_shared_secret', '');
        if ($secret === '') {
            throw new RuntimeException('Apple in-app purchases are not configured.');
        }

        $payload = [
            'receipt-data' => $receipt,
            'password'     => $secret,
        ];

        // Production first, then sandbox on 21007 - same reasoning as verifyApple().
        $res = Http::timeout(20)->post(self::APPLE_PROD, $payload)->json();

        if (($res['status'] ?? null) === 21007) {
            $res = Http::timeout(20)->post(self::APPLE_SANDBOX, $payload)->json();
        }

        $status = $res['status'] ?? -1;
        if ($status !== 0) {
            throw new RuntimeException('Apple rejected this receipt (status ' . $status . ').');
        }

        // Consumables live in receipt.in_app. Do NOT read latest_receipt_info here: it is
        // the auto-renewable view and is empty for a consumable-only receipt.
        $lines = $res['receipt']['in_app'] ?? [];
        if (! is_array($lines) || $lines === []) {
            throw new RuntimeException('This receipt contains no purchase.');
        }

        // Newest first, then take the line for the product we were actually asked to grant.
        usort($lines, fn ($a, $b) => (int) ($b['purchase_date_ms'] ?? 0) <=> (int) ($a['purchase_date_ms'] ?? 0));

        $match = null;
        foreach ($lines as $line) {
            if (($line['product_id'] ?? null) === $productId) {
                $match = $line;
                break;
            }
        }

        // A receipt is only evidence for the product it is FOR. Without this check a real
        // receipt for a $0.19 pack would credit the coins of a $2,000 one.
        if (! $match) {
            throw new RuntimeException('This receipt is not for the coin pack you selected.');
        }

        $txId = (string) ($match['transaction_id'] ?? '');
        if ($txId === '') {
            throw new RuntimeException('This receipt has no transaction id.');
        }

        return [
            'transaction_id' => $txId,
            'product_id'     => (string) $match['product_id'],
            'quantity'       => max(1, (int) ($match['quantity'] ?? 1)),
            'raw'            => $match,
        ];
    }
}
