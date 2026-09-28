<?php

namespace App\Licensing\Support;

/**
 * Wire format for a signed licence token. Shared by both sides, because an
 * encoder and a decoder that disagree produce a system that appears to work
 * until the day it silently does not.
 *
 * Format:
 *
 *     RLS1.<base64url(payload JSON)>.<base64url(RSA-SHA256 signature)>
 *
 * base64url (RFC 4648 sec. 5) rather than plain base64 so the token survives
 * being pasted into a URL, an env file, a shell argument or a JSON string
 * without escaping.
 *
 * THE CRITICAL PROPERTY, and the reason decode() hands back raw bytes:
 * the signature covers the EXACT payload bytes that were signed. Verification
 * must never re-encode the decoded array and check the signature against that.
 * json_encode is not canonical - key order, unicode escaping, slash escaping
 * and float formatting all vary between producers and PHP versions - so a
 * re-encode round trip would fail for entirely legitimate tokens, and the
 * usual "fix" for that (loosening the check) is how signature verification
 * gets quietly disabled. decode() therefore returns payload_bytes, and
 * LicenseVerifier verifies against those bytes and nothing else.
 */
final class LicenseTokenCodec
{
    public const PREFIX = 'RLS1';

    /** Hard ceiling so a hostile token cannot force a large base64 decode. */
    private const MAX_TOKEN_BYTES = 16384;

    public static function encode(array $payload, string $signature): string
    {
        $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        if ($json === false) {
            throw new \RuntimeException('Licence payload could not be encoded.');
        }

        return self::PREFIX . '.' . self::b64UrlEncode($json) . '.' . self::b64UrlEncode($signature);
    }

    /**
     * @return array{payload: array<string,mixed>, payload_bytes: string, signature: string}|null
     *         null for anything malformed. Callers treat null as "invalid
     *         licence", never as "no licence restriction".
     */
    public static function decode(?string $token): ?array
    {
        if ($token === null) {
            return null;
        }

        $token = trim($token);
        if ($token === '' || strlen($token) > self::MAX_TOKEN_BYTES) {
            return null;
        }

        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }

        [$prefix, $encodedPayload, $encodedSignature] = $parts;

        if (! hash_equals(self::PREFIX, $prefix)) {
            return null;
        }

        $payloadBytes = self::b64UrlDecode($encodedPayload);
        $signature    = self::b64UrlDecode($encodedSignature);

        if ($payloadBytes === null || $signature === null || $signature === '') {
            return null;
        }

        $payload = json_decode($payloadBytes, true);
        if (! is_array($payload)) {
            return null;
        }

        return [
            'payload'       => $payload,
            'payload_bytes' => $payloadBytes,
            'signature'     => $signature,
        ];
    }

    public static function b64UrlEncode(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    /** Strict: rejects rather than silently repairing malformed input. */
    public static function b64UrlDecode(string $encoded): ?string
    {
        if ($encoded === '' || preg_match('/^[A-Za-z0-9_-]+$/', $encoded) !== 1) {
            return null;
        }

        $padded  = strtr($encoded, '-_', '+/');
        $padding = strlen($padded) % 4;
        if ($padding > 0) {
            $padded .= str_repeat('=', 4 - $padding);
        }

        $decoded = base64_decode($padded, true);

        return $decoded === false ? null : $decoded;
    }
}
