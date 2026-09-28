<?php

namespace Tests\Unit;

use App\Services\AppAttest\AppAttestException;
use App\Services\AppAttest\AppleCertificate;
use App\Services\AppAttest\AssertionVerifier;
use App\Services\AppAttest\AttestationVerifier;
use App\Services\AppAttest\AuthenticatorData;
use App\Services\AppAttest\ChallengeService;
use CBOR\ByteStringObject;
use CBOR\MapObject;
use CBOR\TextStringObject;
use CBOR\ListObject;
use Tests\TestCase;

/**
 * What these tests can and cannot establish.
 *
 * A genuine attestation can only be produced by Apple silicon, so there is no
 * way to assert "a real one passes" without a device in the loop. What IS
 * testable, and matters more for catching a broken verifier, is the opposite:
 * that forged and malformed input is REJECTED, and rejected for the right
 * reason. A verifier that accepts everything and one that works are
 * indistinguishable from a happy-path test; they are trivially distinguished by
 * these.
 *
 * The chain test is the important one. "Decode the CBOR and trust the fields"
 * is the classic broken App Attest implementation, and it passes every test
 * that does not present it with a certificate an attacker could actually make.
 */
class AppAttestVerificationTest extends TestCase
{
    private function verifier(): AttestationVerifier
    {
        config([
            'appattest.enabled'      => true,
            'appattest.team_id'      => 'J7JQWZM8H4',
            'appattest.bundle_id'    => 'com.reelsoo.app',
            'appattest.environments' => ['production', 'development'],
            'appattest.root_ca'      => resource_path('certs/Apple_App_Attestation_Root_CA.pem'),
        ]);

        return new AttestationVerifier(new ChallengeService());
    }

    /**
     * A self-signed P-256 certificate - what a forger can produce unaided,
     * with no relationship to Apple's root.
     *
     * Embedded as a fixture rather than generated per run on purpose:
     * openssl_pkey_new needs an openssl.cnf that is not present on every
     * machine (it is missing from the Windows PHP build this was written on),
     * and this is the one test that must never be skipped for environmental
     * reasons. It carries no private key - only the certificate is needed to
     * prove the chain check rejects it.
     */
    private function selfSignedCertDer(): string
    {
        $b64 = 'MIIB/zCCAaSgAwIBAgIBADAKBggqhkjOPQQDAjBeMRcwFQYDVQQDDA5mb3JnZWQuZXhhbXBsZTELMAkGA1UEBhMCQVUx'
            . 'EzARBgNVBAgMClNvbWUtU3RhdGUxITAfBgNVBAoMGEludGVybmV0IFdpZGdpdHMgUHR5IEx0ZDAeFw0yNjA5MDQxMDUy'
            . 'MjRaFw0yNjA5MDUxMDUyMjRaMF4xFzAVBgNVBAMMDmZvcmdlZC5leGFtcGxlMQswCQYDVQQGEwJBVTETMBEGA1UECAwK'
            . 'U29tZS1TdGF0ZTEhMB8GA1UECgwYSW50ZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcD'
            . 'QgAE+/Xvwpq+5OLBVn/Q1cRVFsXLPp9NIFM0o8UGKe5UX5iu7YK3exf9Y4PYXb95sZKpkBLcgD2fJ2lWolcFQftz0aNT'
            . 'MFEwHQYDVR0OBBYEFOBVoILL8KxvxqQdqVBAexgXK0V6MB8GA1UdIwQYMBaAFOBVoILL8KxvxqQdqVBAexgXK0V6MA8G'
            . 'A1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDSQAwRgIhAJJ1vSr2HIV2yPLcbZrISditKRCfWsBjLwBFu29f9pkEAiEA'
            . 'l0hED7SnQ6+inTfKhw2QCPbTyVP+uDesnwBZf+3Vs2Y=';

        return base64_decode($b64, true);
    }

    private function attestationCbor(string $certDer, string $authData): string
    {
        $map = MapObject::create()
            ->add(TextStringObject::create('fmt'), TextStringObject::create('apple-appattest'))
            ->add(
                TextStringObject::create('attStmt'),
                MapObject::create()->add(
                    TextStringObject::create('x5c'),
                    ListObject::create()
                        ->add(ByteStringObject::create($certDer))
                        ->add(ByteStringObject::create($certDer)),
                ),
            )
            ->add(TextStringObject::create('authData'), ByteStringObject::create($authData));

        return base64_encode((string) $map);
    }

    /** authData with a valid shape, so the test fails on trust and not layout. */
    private function authData(string $appId, string $keyId, string $aaguid = "appattest\0\0\0\0\0\0\0"): string
    {
        return hash('sha256', $appId, true)   // rpIdHash
            . chr(0x40)                        // flags: attested credential data
            . pack('N', 0)                     // signCount
            . $aaguid
            . pack('n', strlen($keyId))
            . $keyId
            . str_repeat("\0", 8);             // stand-in for the COSE key
    }

    public function test_a_self_signed_certificate_is_rejected(): void
    {
        $der   = $this->selfSignedCertDer();
        $keyId = AppleCertificate::keyIdentifier(AppleCertificate::toPem($der));

        $this->expectException(AppAttestException::class);
        // Not merely "an exception" - it must fail at the chain, proving the
        // chain is what stopped it rather than some incidental later check.
        $this->expectExceptionMessage('chain_untrusted');

        $this->verifier()->verify(
            base64_encode($keyId),
            $this->attestationCbor($der, $this->authData('J7JQWZM8H4.com.reelsoo.app', $keyId)),
            'challenge-value',
        );
    }

    public function test_garbage_is_rejected_without_crashing(): void
    {
        $this->expectException(AppAttestException::class);
        $this->verifier()->verify(base64_encode(str_repeat('k', 32)), base64_encode('not cbor at all'), 'c');
    }

    public function test_a_key_id_of_the_wrong_length_is_rejected(): void
    {
        $this->expectException(AppAttestException::class);
        $this->expectExceptionMessage('key_id_malformed');
        $this->verifier()->verify(base64_encode('short'), base64_encode('x'), 'c');
    }

    public function test_authenticator_data_shorter_than_the_header_is_rejected(): void
    {
        $this->expectException(AppAttestException::class);
        $this->expectExceptionMessage('authdata_too_short');
        AuthenticatorData::parse(str_repeat("\0", 36));
    }

    public function test_a_credential_length_running_past_the_buffer_is_rejected(): void
    {
        $raw = str_repeat("\0", 32) . chr(0x40) . pack('N', 0) . str_repeat("\0", 16)
            . pack('n', 9999)      // claims 9999 bytes of credential id
            . 'tiny';

        $this->expectException(AppAttestException::class);
        $this->expectExceptionMessage('authdata_bad_credential_length');
        AuthenticatorData::parse($raw);
    }

    public function test_environment_comes_from_the_aaguid(): void
    {
        $prod = AuthenticatorData::parse($this->authData('a.b', str_repeat('k', 32)));
        $this->assertSame('production', $prod->environment());

        $dev = AuthenticatorData::parse(
            $this->authData('a.b', str_repeat('k', 32), 'appattestdevelop'),
        );
        $this->assertSame('development', $dev->environment());

        // Anything else is unknown rather than quietly treated as production.
        $bogus = AuthenticatorData::parse(
            $this->authData('a.b', str_repeat('k', 32), str_repeat("\x01", 16)),
        );
        $this->assertNull($bogus->environment());
    }

    public function test_assertion_client_data_binds_method_path_and_body(): void
    {
        $a = AssertionVerifier::clientData('chal', 'post', '/v1/wallet/withdraw', 'digest');
        $b = AssertionVerifier::clientData('chal', 'POST', '/v1/wallet/withdraw', 'digest');
        $this->assertSame($a, $b, 'method must be case-normalised, or the client and server disagree');

        // Every component has to change the signed bytes, or an assertion could
        // be lifted from one request onto another.
        $this->assertNotSame($a, AssertionVerifier::clientData('other', 'POST', '/v1/wallet/withdraw', 'digest'));
        $this->assertNotSame($a, AssertionVerifier::clientData('chal', 'GET', '/v1/wallet/withdraw', 'digest'));
        $this->assertNotSame($a, AssertionVerifier::clientData('chal', 'POST', '/v1/wallet/topup', 'digest'));
        $this->assertNotSame($a, AssertionVerifier::clientData('chal', 'POST', '/v1/wallet/withdraw', 'other'));
    }

    public function test_the_bundled_apple_root_is_the_real_one(): void
    {
        $parsed = openssl_x509_parse(file_get_contents(resource_path('certs/Apple_App_Attestation_Root_CA.pem')));

        $this->assertIsArray($parsed);
        $this->assertSame('Apple App Attestation Root CA', $parsed['subject']['CN']);
        $this->assertSame('Apple Inc.', $parsed['subject']['O']);
        // Self-signed root: subject and issuer match.
        $this->assertSame($parsed['subject'], $parsed['issuer']);
    }
}
