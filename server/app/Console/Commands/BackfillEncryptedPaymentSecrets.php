<?php

namespace App\Console\Commands;

use App\Models\AdminCoinSetting;
use Illuminate\Console\Command;

/**
 * One-time (but idempotent) backfill: encrypt any admin_coin_settings secret
 * value still sitting in plaintext from before AdminCoinSetting encrypted
 * SECRET_KEYS at rest.
 *
 * Safe to run repeatedly and safe to run before or after the app code deploys
 * that started encrypting on write - getValue() already tolerates plaintext,
 * so this just re-saves each secret through setValue() (which always encrypts
 * secret keys), converging every row on encrypted without ever needing to know
 * which ones already were.
 *
 *   php artisan settings:encrypt-payment-secrets
 */
class BackfillEncryptedPaymentSecrets extends Command
{
    protected $signature   = 'settings:encrypt-payment-secrets';
    protected $description = 'Encrypt any plaintext admin_coin_settings secret values (PayPal/Stripe/Razorpay/IAP)';

    public function handle(): int
    {
        $touched = 0;

        foreach (AdminCoinSetting::SECRET_KEYS as $key) {
            $value = AdminCoinSetting::getValue($key);
            if ($value === null || $value === '') {
                continue;
            }

            // Re-save through setValue(): decrypts-or-passes-through on read
            // above, then unconditionally encrypts secret keys on write below.
            AdminCoinSetting::setValue($key, $value);
            $touched++;
            $this->line("  encrypted: {$key}");
        }

        $this->info($touched > 0
            ? "Done. {$touched} secret value(s) confirmed encrypted at rest."
            : 'Nothing to do - no payment secrets are currently set.');

        return self::SUCCESS;
    }
}
