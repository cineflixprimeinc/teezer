<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;

class AdminCoinSetting extends Model
{
    protected $fillable = ['key', 'value', 'description'];

    /**
     * Keys holding a third-party secret (payment gateway credentials, an IAP
     * shared secret, a Google service-account JSON blob) rather than a plain
     * setting. Encrypted at rest with Crypt (bound to APP_KEY) - this table was
     * plaintext TEXT for these values, which matters a lot for a codebase meant
     * to be resold: a buyer who gets a DB dump/backup as part of the handover
     * must not be able to read the previous owner's live payment keys straight
     * out of the database.
     *
     * AdminPaymentSettingsController already never returns these values (masked
     * placeholder + is_set flag only) - this closes the matching at-rest gap.
     * Same pattern as SocialLoginConfig's secret fields.
     */
    public const SECRET_KEYS = [
        'paypal_client_secret',
        'stripe_secret_key',
        'stripe_webhook_secret',
        'razorpay_key_secret',
        'apple_shared_secret',
        'google_service_account_json',
    ];

    /** Get a setting value with an optional default. */
    public static function getValue(string $key, mixed $default = null): mixed
    {
        $row = Cache::remember("admin_coin_setting:{$key}", 300, fn () =>
            static::where('key', $key)->first()
        );
        if (! $row) {
            return $default;
        }

        return self::isSecretKey($key) ? (self::decrypt($row->value) ?? $default) : $row->value;
    }

    /** Set a setting value and bust the cache. Secret keys are encrypted before storage. */
    public static function setValue(string $key, mixed $value): void
    {
        $store = (self::isSecretKey($key) && $value !== null && $value !== '')
            ? Crypt::encryptString((string) $value)
            : $value;

        static::updateOrCreate(['key' => $key], ['value' => $store]);
        Cache::forget("admin_coin_setting:{$key}");
    }

    public static function isSecretKey(string $key): bool
    {
        return in_array($key, self::SECRET_KEYS, true);
    }

    /**
     * Decrypt a stored secret, tolerating rows written before encryption was
     * added (or written directly into the DB) - same tolerance EncryptedJson
     * uses for IntegrationSetting.credentials. A row that fails to decrypt is
     * returned as-is rather than dropped; the next setValue() call for that key
     * re-encrypts it, so plaintext rows self-heal as they're touched.
     */
    private static function decrypt(?string $value): ?string
    {
        if ($value === null || $value === '') {
            return $value;
        }

        try {
            return Crypt::decryptString($value);
        } catch (\Throwable) {
            return $value;
        }
    }
}
