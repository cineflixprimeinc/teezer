<?php

namespace App\Services;

use App\Services\SocialLoginConfig;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * Verifies provider identity tokens for mobile social sign-in - dependency-free.
 *  - Google: validated via Google's tokeninfo endpoint (checks signature + exp,
 *    returns claims). We additionally enforce `aud` (client id) + `iss`.
 *  - Apple: identity token (JWT) verified against Apple's JWKS using native
 *    PHP openssl (RS256), with issuer + audience (bundle id) + exp checks.
 *    No third-party JWT library (avoids the firebase/php-jwt advisory).
 *
 * Returns null on any failure - the controller maps that to a 422.
 */
class SocialAuthVerifier
{
    /** @return array{sub:string,email:?string,name:?string,email_verified:bool}|null */
    public function google(string $idToken): ?array
    {
        try {
            $resp = Http::timeout(8)->get('https://oauth2.googleapis.com/tokeninfo', ['id_token' => $idToken]);
            if (!$resp->successful()) {
                return null;
            }
            $c = $resp->json();
            if (!is_array($c) || empty($c['sub'])) {
                return null;
            }

            $allowed = SocialLoginConfig::list('google', 'client_ids');
            if ($allowed && !in_array((string) ($c['aud'] ?? ''), $allowed, true)) {
                return null;
            }
            $iss = (string) ($c['iss'] ?? '');
            if ($iss !== 'https://accounts.google.com' && $iss !== 'accounts.google.com') {
                return null;
            }

            return [
                'sub'            => (string) $c['sub'],
                'email'          => isset($c['email']) ? (string) $c['email'] : null,
                'name'           => isset($c['name']) ? (string) $c['name'] : null,
                'email_verified' => filter_var($c['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN),
            ];
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * Exchange a Google OAuth authorization code for tokens (server-side flow),
     * then verify the returned id_token. This is the path that actually uses the
     * Client Secret; the plain id_token path above needs only the client IDs.
     *
     * @return array{sub:string,email:?string,name:?string,email_verified:bool}|null
     */
    public function googleCode(string $code, ?string $redirectUri = null): ?array
    {
        try {
            $clientId = SocialLoginConfig::list('google', 'client_ids')[0] ?? '';
            $secret   = (string) (SocialLoginConfig::value('google', 'client_secret') ?? '');
            if ($clientId === '' || $secret === '') {
                return null; // code flow needs both a client id and secret
            }

            $resp = Http::asForm()->timeout(8)->post('https://oauth2.googleapis.com/token', [
                'code'          => $code,
                'client_id'     => $clientId,
                'client_secret' => $secret,
                'redirect_uri'  => (string) ($redirectUri ?? ''),
                'grant_type'    => 'authorization_code',
            ]);
            if (!$resp->successful()) {
                return null;
            }
            $idToken = (string) $resp->json('id_token');
            return $idToken !== '' ? $this->google($idToken) : null;
        } catch (\Throwable) {
            return null;
        }
    }

    /** @return array{sub:string,email:?string,name:?string,email_verified:bool}|null */
    public function apple(string $identityToken): ?array
    {
        try {
            $parts = explode('.', $identityToken);
            if (count($parts) !== 3) {
                return null;
            }
            [$h64, $p64, $s64] = $parts;

            $header  = json_decode($this->b64urlDecode($h64), true);
            $payload = json_decode($this->b64urlDecode($p64), true);
            if (!is_array($header) || !is_array($payload)) {
                return null;
            }
            if (($header['alg'] ?? '') !== 'RS256' || empty($header['kid'])) {
                return null;
            }

            $jwk = $this->appleKey((string) $header['kid']);
            if (!$jwk) {
                return null;
            }

            $pem = $this->jwkToPem((string) $jwk['n'], (string) $jwk['e']);
            $signature = $this->b64urlDecode($s64);
            $ok = openssl_verify("{$h64}.{$p64}", $signature, $pem, OPENSSL_ALGO_SHA256);
            if ($ok !== 1) {
                return null;
            }

            if ((string) ($payload['iss'] ?? '') !== 'https://appleid.apple.com') {
                return null;
            }
            $allowed = SocialLoginConfig::list('apple', 'bundle_ids');
            if ($allowed && !in_array((string) ($payload['aud'] ?? ''), $allowed, true)) {
                return null;
            }
            if (isset($payload['exp']) && (int) $payload['exp'] < time()) {
                return null;
            }

            return [
                'sub'            => (string) ($payload['sub'] ?? ''),
                'email'          => isset($payload['email']) ? (string) $payload['email'] : null,
                'name'           => null, // Apple sends the name separately, only on first sign-in
                'email_verified' => filter_var($payload['email_verified'] ?? true, FILTER_VALIDATE_BOOLEAN),
            ];
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * Verify a Facebook user access token via the Graph API.
     *  - debug_token confirms the token is valid AND was minted for OUR app id
     *    (prevents a token from another Facebook app being replayed here).
     *  - /me returns the profile; the call is signed with appsecret_proof.
     * Facebook only returns an email the user granted, and Facebook verifies
     * its emails, so a present email is treated as verified.
     *
     * @return array{sub:string,email:?string,name:?string,email_verified:bool}|null
     */
    public function facebook(string $accessToken): ?array
    {
        try {
            $appId     = (string) (SocialLoginConfig::value('facebook', 'app_id') ?? '');
            $appSecret = (string) (SocialLoginConfig::value('facebook', 'app_secret') ?? '');
            if ($appId === '' || $appSecret === '') {
                return null; // not configured
            }

            // 1) Validate the token belongs to our app and is still valid.
            $debug = Http::timeout(8)->get('https://graph.facebook.com/debug_token', [
                'input_token'  => $accessToken,
                'access_token' => $appId . '|' . $appSecret,
            ]);
            $d = $debug->successful() ? ($debug->json('data') ?? []) : [];
            if (empty($d['is_valid']) || (string) ($d['app_id'] ?? '') !== $appId || empty($d['user_id'])) {
                return null;
            }

            // 2) Fetch the profile, signed with appsecret_proof.
            $proof = hash_hmac('sha256', $accessToken, $appSecret);
            $me = Http::timeout(8)->get('https://graph.facebook.com/v19.0/me', [
                'fields'          => 'id,name,email',
                'access_token'    => $accessToken,
                'appsecret_proof' => $proof,
            ]);
            if (!$me->successful()) {
                return null;
            }
            $u = $me->json();
            if (!is_array($u) || empty($u['id']) || (string) $u['id'] !== (string) $d['user_id']) {
                return null;
            }

            $email = isset($u['email']) ? (string) $u['email'] : null;
            return [
                'sub'            => (string) $u['id'],
                'email'          => $email,
                'name'           => isset($u['name']) ? (string) $u['name'] : null,
                'email_verified' => $email !== null && $email !== '',
            ];
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * Verify a TikTok sign-in. Accepts an OAuth authorization `code` (exchanged
     * server-side with the client secret) or, if the client already holds one,
     * a raw `access_token`. TikTok's Login Kit does NOT return an email, so the
     * account is resolved purely by the provider subject (open_id) upstream.
     *
     * @param array{code?:string,access_token?:string,redirect_uri?:string} $input
     * @return array{sub:string,email:?string,name:?string,email_verified:bool}|null
     */
    public function tiktok(array $input): ?array
    {
        try {
            $clientKey    = (string) (SocialLoginConfig::value('tiktok', 'client_key') ?? '');
            $clientSecret = (string) (SocialLoginConfig::value('tiktok', 'client_secret') ?? '');
            if ($clientKey === '' || $clientSecret === '') {
                return null; // not configured
            }

            $accessToken = (string) ($input['access_token'] ?? '');
            $openId      = '';

            if ($accessToken === '' && !empty($input['code'])) {
                $redirect = (string) ($input['redirect_uri'] ?? SocialLoginConfig::value('tiktok', 'redirect_uri') ?? '');
                $tok = Http::asForm()->timeout(8)->post('https://open.tiktokapis.com/v2/oauth/token/', [
                    'client_key'    => $clientKey,
                    'client_secret' => $clientSecret,
                    'code'          => (string) $input['code'],
                    'grant_type'    => 'authorization_code',
                    'redirect_uri'  => $redirect,
                ]);
                if (!$tok->successful()) {
                    return null;
                }
                $accessToken = (string) $tok->json('access_token');
                $openId      = (string) $tok->json('open_id');
            }

            if ($accessToken === '') {
                return null;
            }

            $info = Http::withToken($accessToken)->timeout(8)->get(
                'https://open.tiktokapis.com/v2/user/info/',
                ['fields' => 'open_id,union_id,display_name,avatar_url'],
            );
            if (!$info->successful()) {
                return null;
            }
            $user = $info->json('data.user') ?? [];
            $sub  = (string) ($user['open_id'] ?? $openId);
            if ($sub === '') {
                return null;
            }

            return [
                'sub'            => $sub,
                'email'          => null,          // TikTok never provides an email
                'name'           => isset($user['display_name']) ? (string) $user['display_name'] : null,
                'email_verified' => false,
            ];
        } catch (\Throwable) {
            return null;
        }
    }

    /** Fetch Apple's JWKS (cached) and return the JWK matching $kid. */
    private function appleKey(string $kid): ?array
    {
        $keys = Cache::remember('apple_jwks', 3600, function () {
            $r = Http::timeout(8)->get('https://appleid.apple.com/auth/keys');
            return $r->successful() ? ($r->json('keys') ?? []) : [];
        });

        foreach ((array) $keys as $k) {
            if (($k['kid'] ?? null) === $kid && ($k['kty'] ?? '') === 'RSA') {
                return $k;
            }
        }
        // Cache miss on a freshly-rotated key → drop cache so the next call refetches.
        Cache::forget('apple_jwks');
        return null;
    }

    /** Build a PEM public key from a JWK's RSA modulus (n) and exponent (e). */
    private function jwkToPem(string $n, string $e): string
    {
        $modulus  = $this->b64urlDecode($n);
        $exponent = $this->b64urlDecode($e);

        // DER INTEGER: prepend 0x00 when the high bit is set so it stays positive.
        if (ord($modulus[0]) > 0x7f) {
            $modulus = "\x00" . $modulus;
        }

        $modInt = "\x02" . $this->derLen(strlen($modulus)) . $modulus;
        $expInt = "\x02" . $this->derLen(strlen($exponent)) . $exponent;
        $rsaSeq = "\x30" . $this->derLen(strlen($modInt . $expInt)) . $modInt . $expInt;

        // BIT STRING (leading 0x00 unused-bits byte) wrapping the RSA key sequence.
        $bitStr = "\x03" . $this->derLen(strlen($rsaSeq) + 1) . "\x00" . $rsaSeq;

        // AlgorithmIdentifier: rsaEncryption OID 1.2.840.113549.1.1.1 + NULL params.
        $algId = "\x30\x0d\x06\x09\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01\x05\x00";

        $spki = "\x30" . $this->derLen(strlen($algId . $bitStr)) . $algId . $bitStr;

        return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($spki), 64, "\n") . "-----END PUBLIC KEY-----\n";
    }

    /** DER length octets (short or long form). */
    private function derLen(int $length): string
    {
        if ($length <= 0x7f) {
            return chr($length);
        }
        $bytes = ltrim(pack('N', $length), "\x00");
        return chr(0x80 | strlen($bytes)) . $bytes;
    }

    private function b64urlDecode(string $data): string
    {
        $pad = strlen($data) % 4;
        if ($pad) {
            $data .= str_repeat('=', 4 - $pad);
        }
        return (string) base64_decode(strtr($data, '-_', '+/'));
    }
}
