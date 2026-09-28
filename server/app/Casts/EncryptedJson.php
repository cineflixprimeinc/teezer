<?php

namespace App\Casts;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Crypt;

/**
 * Array cast that ALWAYS writes encrypted but reads either form.
 *
 * Laravel's built-in `encrypted:array` throws a DecryptException on any value
 * that was stored before the column was encrypted. That would break every payout
 * method during the window between deploying this code and running the back-fill
 * migration - and there is no deploy order that avoids it, because the old cast
 * cannot read an encrypted row either. Tolerating plaintext on read closes that
 * window from both sides.
 *
 * Writes are encrypted unconditionally, so rows converge on encrypted as they are
 * touched and the migration finishes the rest. Once the back-fill has run
 * everywhere, the plaintext branch is simply never taken.
 *
 * NOTE: encrypted values are bound to APP_KEY. Rotating APP_KEY without listing
 * the old key in APP_PREVIOUS_KEYS makes every value here permanently
 * unreadable - see the APP_KEY notes in server/.env.example.
 */
class EncryptedJson implements CastsAttributes
{
    /** @return array<string, mixed>|null */
    public function get(Model $model, string $key, mixed $value, array $attributes): ?array
    {
        if ($value === null || $value === '') {
            return null;
        }

        try {
            $value = Crypt::decryptString($value);
        } catch (DecryptException) {
            // A row written before the back-fill. Read the stored JSON as-is.
        }

        $decoded = json_decode((string) $value, true);

        return is_array($decoded) ? $decoded : null;
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        if ($value === null) {
            return null;
        }

        return Crypt::encryptString(json_encode($value));
    }
}
