<?php

namespace App\Services;

use App\Models\User;

/**
 * Native TOTP (RFC 6238) - Google Authenticator / Authy compatible.
 * SHA1, 6 digits, 30-second period. No external dependency so deploys
 * stay to a plain `git pull` + migrate.
 */
class TwoFactorService
{
    private const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    private const DIGITS = 6;
    private const PERIOD = 30;

    /** Generate a new random base32 secret (default 160 bits → 32 chars). */
    public function generateSecret(int $length = 32): string
    {
        $secret = '';
        for ($i = 0; $i < $length; $i++) {
            $secret .= self::BASE32[random_int(0, 31)];
        }
        return $secret;
    }

    /**
     * otpauth:// URI the authenticator app encodes as a QR code.
     * label = issuer:account so the app shows "Reelsoo (email)".
     */
    public function otpauthUri(User $user, string $secret): string
    {
        $issuer  = config('app.name', 'Teezer');
        $account = $user->email ?: ($user->username ?: ('user' . $user->id));
        $label   = rawurlencode($issuer) . ':' . rawurlencode($account);

        return 'otpauth://totp/' . $label . '?' . http_build_query([
            'secret'    => $secret,
            'issuer'    => $issuer,
            'algorithm' => 'SHA1',
            'digits'    => self::DIGITS,
            'period'    => self::PERIOD,
        ]);
    }

    /**
     * Verify a 6-digit code against the secret, allowing ±1 time-step (~30s)
     * of clock drift. Returns true on the first matching step.
     */
    public function verify(string $secret, string $code, int $window = 1): bool
    {
        $code = preg_replace('/\D/', '', $code);
        if (strlen($code) !== self::DIGITS) {
            return false;
        }

        $currentStep = (int) floor(time() / self::PERIOD);
        for ($i = -$window; $i <= $window; $i++) {
            if (hash_equals($this->codeForStep($secret, $currentStep + $i), $code)) {
                return true;
            }
        }
        return false;
    }

    /** Generate N single-use recovery codes (format: XXXXX-XXXXX). */
    public function generateRecoveryCodes(int $count = 8): array
    {
        $codes = [];
        for ($i = 0; $i < $count; $i++) {
            $codes[] = $this->randomCode(5) . '-' . $this->randomCode(5);
        }
        return $codes;
    }

    private function codeForStep(string $secret, int $step): string
    {
        $key     = $this->base32Decode($secret);
        $binStep = pack('N*', 0) . pack('N*', $step); // 64-bit big-endian counter
        $hash    = hash_hmac('sha1', $binStep, $key, true);

        $offset = ord($hash[strlen($hash) - 1]) & 0x0f;
        $value  = ((ord($hash[$offset]) & 0x7f) << 24)
                | ((ord($hash[$offset + 1]) & 0xff) << 16)
                | ((ord($hash[$offset + 2]) & 0xff) << 8)
                |  (ord($hash[$offset + 3]) & 0xff);

        return str_pad((string) ($value % (10 ** self::DIGITS)), self::DIGITS, '0', STR_PAD_LEFT);
    }

    private function base32Decode(string $b32): string
    {
        $b32    = strtoupper(rtrim($b32, '='));
        $buffer = 0;
        $bits   = 0;
        $out    = '';

        foreach (str_split($b32) as $char) {
            $val = strpos(self::BASE32, $char);
            if ($val === false) {
                continue;
            }
            $buffer = ($buffer << 5) | $val;
            $bits  += 5;
            if ($bits >= 8) {
                $bits -= 8;
                $out  .= chr(($buffer >> $bits) & 0xff);
            }
        }
        return $out;
    }

    private function randomCode(int $length): string
    {
        $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
        $out   = '';
        for ($i = 0; $i < $length; $i++) {
            $out .= $chars[random_int(0, strlen($chars) - 1)];
        }
        return $out;
    }
}
