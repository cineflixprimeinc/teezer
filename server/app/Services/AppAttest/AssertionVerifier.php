<?php

namespace App\Services\AppAttest;

use App\Models\AppAttestDevice;
use CBOR\Decoder;
use CBOR\StringStream;

/**
 * Verifies a per-request App Attest assertion.
 *
 * Where the attestation is a one-time "this key is real", an assertion is the
 * repeatable "and this specific request came from it". The client signs over a
 * client-data blob built from the server's challenge plus a digest of the
 * request itself, so a captured assertion cannot be lifted onto a different
 * request - which is the whole reason the request binding exists rather than
 * signing the challenge alone.
 */
class AssertionVerifier
{
    /**
     * The exact bytes both sides agree the device signs over.
     *
     * Order and separator are fixed and must match the client
     * (mobile/src/services/app-attest.ts) byte for byte - a mismatch here is
     * indistinguishable from an attack, and would fail closed for every user.
     * The body digest is hashed rather than included so a large upload does not
     * have to be buffered twice, and so nothing sensitive from the body is
     * reconstructable from anything stored or logged.
     */
    public static function clientData(string $challenge, string $method, string $path, string $bodyDigest): string
    {
        return implode('|', [strtoupper($method), $path, $bodyDigest, $challenge]);
    }

    /**
     * @param  string  $assertion base64 CBOR assertion object
     * @throws AppAttestException
     */
    public function verify(AppAttestDevice $device, string $assertion, string $clientData): void
    {
        if (! $device->isActive()) {
            throw new AppAttestException('device_revoked');
        }

        $raw = base64_decode($assertion, true);
        if ($raw === false || $raw === '') {
            throw new AppAttestException('assertion_malformed');
        }

        try {
            $object = Decoder::create()->decode(new StringStream($raw))->normalize();
        } catch (\Throwable) {
            throw new AppAttestException('cbor_undecodable');
        }

        if (! is_array($object)) {
            throw new AppAttestException('assertion_not_a_map');
        }

        $signature    = $object['signature'] ?? null;
        $authDataRaw  = $object['authenticatorData'] ?? null;
        if (! is_string($signature) || ! is_string($authDataRaw)) {
            throw new AppAttestException('assertion_missing_fields');
        }

        $authData = AuthenticatorData::parse($authDataRaw);

        /* The App ID must still be ours. Cheap, and catches a key attested for
         * a different app being replayed at this one. */
        $expectedRpId = hash('sha256', "{$device->team_id}.{$device->bundle_id}", true);
        if (! ChallengeService::equals($expectedRpId, $authData->rpIdHash)) {
            throw new AppAttestException('app_id_mismatch');
        }

        /* nonce = SHA256( authenticatorData || SHA256(clientData) ), signed
         * with the attested key. Same construction as the attestation, which is
         * why the client data has to be reproduced exactly. */
        $clientDataHash = hash('sha256', $clientData, true);
        $nonce          = hash('sha256', $authDataRaw . $clientDataHash, true);

        $ok = openssl_verify($nonce, $signature, $device->public_key, OPENSSL_ALGO_SHA256);
        if ($ok !== 1) {
            throw new AppAttestException('signature_invalid');
        }

        /* Replay defence. Apple guarantees the counter strictly increases, so a
         * replayed assertion necessarily carries one we have already recorded.
         *
         * The compare-and-set is done by the database in a single statement
         * (see AppAttestDevice::advanceCounter) rather than read-compare-write
         * here: two legitimate concurrent requests would otherwise read the same
         * previous value and each look like a replay of the other, and two
         * genuine replays could both pass before either wrote. */
        if (! $device->advanceCounter($authData->signCount)) {
            throw new AppAttestException('counter_replayed');
        }
    }
}
