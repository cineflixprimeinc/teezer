<?php

namespace App\Services\AppAttest;

use CBOR\Decoder;
use CBOR\StringStream;

/**
 * Verifies an App Attest attestation object - the one-time proof, produced by
 * DCAppAttestService.attestKey(), that a freshly generated key lives in the
 * Secure Enclave of a real Apple device running a genuine build of THIS app.
 *
 * Implements Apple's published procedure ("Validating Apps That Connect to Your
 * Server") in full and in order. Every step is a hard failure; there is
 * deliberately no partial-credit path, because a partially verified attestation
 * is worth exactly nothing and the tempting shortcuts here - decode the CBOR,
 * read the fields, trust them - are precisely what an attacker would forge.
 *
 * What this establishes, and its limits: a passing attestation says the request
 * came from an unmodified build of com.teezer.app on genuine Apple hardware.
 * It says nothing about WHO is using it. Identity remains Sanctum's job; this
 * is an integrity signal layered underneath, never a replacement for
 * authentication or authorization.
 */
class AttestationVerifier
{
    public function __construct(private readonly ChallengeService $challenges) {}

    /**
     * @param  string  $keyId      base64 key identifier, as the app reported it
     * @param  string  $attestation base64 CBOR attestation object
     * @param  string  $challenge  the challenge this server issued
     * @return array{key_id:string, public_key:string, environment:string, receipt:?string, counter:int}
     * @throws AppAttestException
     */
    public function verify(string $keyId, string $attestation, string $challenge): array
    {
        $teamId   = (string) config('appattest.team_id');
        $bundleId = (string) config('appattest.bundle_id');
        if ($teamId === '' || $bundleId === '') {
            throw new AppAttestException('appid_not_configured');
        }

        $rawKeyId = base64_decode($keyId, true);
        if ($rawKeyId === false || strlen($rawKeyId) !== 32) {
            throw new AppAttestException('key_id_malformed');
        }

        $rawAttestation = base64_decode($attestation, true);
        if ($rawAttestation === false || $rawAttestation === '') {
            throw new AppAttestException('attestation_malformed');
        }

        /* 1. Decode the CBOR object. -------------------------------------- */
        try {
            $object = Decoder::create()->decode(new StringStream($rawAttestation))->normalize();
        } catch (\Throwable) {
            throw new AppAttestException('cbor_undecodable');
        }

        if (! is_array($object)) {
            throw new AppAttestException('attestation_not_a_map');
        }

        if (($object['fmt'] ?? null) !== 'apple-appattest') {
            throw new AppAttestException('unexpected_attestation_format');
        }

        $authDataRaw = $object['authData'] ?? null;
        $statement   = $object['attStmt'] ?? null;
        if (! is_string($authDataRaw) || ! is_array($statement)) {
            throw new AppAttestException('attestation_missing_fields');
        }

        $x5c = $statement['x5c'] ?? null;
        if (! is_array($x5c) || count($x5c) < 2) {
            // Apple always sends leaf + intermediate. One certificate means a
            // self-signed leaf with nothing to chain to the root.
            throw new AppAttestException('certificate_chain_missing');
        }

        /* 2. Chain the leaf back to Apple's root. -------------------------- */
        $credCertDer = (string) $x5c[0];
        $credCertPem = AppleCertificate::toPem($credCertDer);
        $intermediates = array_map(
            static fn ($der) => AppleCertificate::toPem((string) $der),
            array_slice($x5c, 1),
        );

        AppleCertificate::verifyChain(
            $credCertPem,
            $intermediates,
            (string) config('appattest.root_ca'),
        );

        /* 3-4. Recompute the nonce the certificate should be committed to.
         *
         * nonce = SHA256( authData || SHA256(challenge) )
         *
         * This is the step that binds the whole attestation to THIS server's
         * challenge. Apple embeds the nonce in the leaf certificate at signing
         * time, so a certificate issued for any other challenge cannot match,
         * which is what makes a captured attestation useless elsewhere. */
        $clientDataHash = hash('sha256', $challenge, true);
        $expectedNonce  = hash('sha256', $authDataRaw . $clientDataHash, true);

        /* 5. Compare against the nonce in the certificate extension. -------- */
        $certNonce = AppleCertificate::nonceFrom($credCertDer);
        if (! ChallengeService::equals($expectedNonce, $certNonce)) {
            throw new AppAttestException('nonce_mismatch');
        }

        /* 6. The key identifier must be the hash of THIS certificate's key,
         *    not merely whatever the client claimed it was. */
        $derivedKeyId = AppleCertificate::keyIdentifier($credCertPem);
        if (! ChallengeService::equals($derivedKeyId, $rawKeyId)) {
            throw new AppAttestException('key_id_mismatch');
        }

        $authData = AuthenticatorData::parse($authDataRaw);

        /* 7. The App ID must be ours. -------------------------------------- */
        $expectedRpId = hash('sha256', "{$teamId}.{$bundleId}", true);
        if (! ChallengeService::equals($expectedRpId, $authData->rpIdHash)) {
            throw new AppAttestException('app_id_mismatch');
        }

        /* 8. A freshly attested key has never signed anything. -------------- */
        if ($authData->signCount !== 0) {
            throw new AppAttestException('counter_not_zero');
        }

        /* 9. Environment comes from the aaguid inside the signed data, so a
         *    development key cannot present itself as production. */
        $environment = $authData->environment();
        if ($environment === null) {
            throw new AppAttestException('unknown_environment');
        }

        $allowed = (array) config('appattest.environments', ['production']);
        if (! in_array($environment, $allowed, true)) {
            throw new AppAttestException("environment_not_allowed:{$environment}");
        }

        /* 10. The credential id in the signed data must be the same key. ----- */
        if ($authData->credentialId === null
            || ! ChallengeService::equals($authData->credentialId, $rawKeyId)) {
            throw new AppAttestException('credential_id_mismatch');
        }

        return [
            'key_id'      => $keyId,
            // Stored as PEM: assertions are verified with openssl_verify, which
            // wants a key rather than the raw point used for the id above.
            'public_key'  => AppleCertificate::publicKeyPem($credCertPem),
            'environment' => $environment,
            'receipt'     => isset($statement['receipt']) && is_string($statement['receipt'])
                ? base64_encode($statement['receipt'])
                : null,
            'counter'     => $authData->signCount,
        ];
    }
}
