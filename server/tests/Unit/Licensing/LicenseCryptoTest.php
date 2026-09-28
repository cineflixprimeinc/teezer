<?php

namespace Tests\Unit\Licensing;

use App\Licensing\Support\DomainNormalizer;
use App\Licensing\Support\LicenseTokenCodec;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The security core of the licensing system, tested against real OpenSSL - no
 * mocks, no stubs.
 *
 * These are the assertions that decide whether the product can be pirated by
 * editing a JSON file, so they are worth having in CI rather than in a
 * developer's memory.
 *
 * Note on environment: RSA key GENERATION needs an openssl.cnf, which some
 * Windows PHP builds ship without (this was hit during development). Signing
 * and verifying do not. The generation-dependent tests skip rather than fail
 * on such a host, so a misconfigured workstation reports "skipped", not a
 * phantom security regression.
 */
class LicenseCryptoTest extends TestCase
{
    private ?string $privatePem = null;
    private ?string $publicPem = null;

    protected function setUp(): void
    {
        parent::setUp();

        $key = @openssl_pkey_new([
            'private_key_bits' => 2048,
            'private_key_type' => OPENSSL_KEYTYPE_RSA,
        ]);

        if ($key === false) {
            return;
        }

        openssl_pkey_export($key, $this->privatePem);
        $details = openssl_pkey_get_details($key);
        $this->publicPem = $details['key'] ?? null;
    }

    private function requireKeys(): void
    {
        if ($this->privatePem === null || $this->publicPem === null) {
            $this->markTestSkipped('OpenSSL cannot generate keys on this host (missing openssl.cnf).');
        }
    }

    /** @return array{0: string, 1: array<string,mixed>} token and payload */
    private function makeToken(array $overrides = []): array
    {
        $payload = array_merge([
            'product'          => 'reelsoo',
            'license_id'       => 'lic_9f3a1c77b2e40d5a8c11',
            'domain'           => 'customer.com',
            'username'         => 'customer01',
            'installation_id'  => 'inst_01j8xw3k7m2q9prbn4vz6hdyta',
            'status'           => 'active',
            'issued_at'        => '2026-09-08T12:00:00+00:00',
            'expires_at'       => '2026-12-07T12:00:00+00:00',
        ], $overrides);

        $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $signature = '';
        openssl_sign($json, $signature, openssl_pkey_get_private($this->privatePem), OPENSSL_ALGO_SHA256);

        return [
            LicenseTokenCodec::PREFIX
                . '.' . LicenseTokenCodec::b64UrlEncode($json)
                . '.' . LicenseTokenCodec::b64UrlEncode($signature),
            $payload,
        ];
    }

    private function verifies(string $token): bool
    {
        $decoded = LicenseTokenCodec::decode($token);

        if ($decoded === null) {
            return false;
        }

        return openssl_verify(
            $decoded['payload_bytes'],
            $decoded['signature'],
            openssl_pkey_get_public($this->publicPem),
            OPENSSL_ALGO_SHA256,
        ) === 1;
    }

    public function test_a_signed_token_verifies_with_the_public_key_alone(): void
    {
        $this->requireKeys();

        [$token, $payload] = $this->makeToken();

        $this->assertTrue($this->verifies($token));
        $this->assertSame($payload, LicenseTokenCodec::decode($token)['payload']);
    }

    public function test_the_token_is_url_safe(): void
    {
        $this->requireKeys();

        [$token] = $this->makeToken();

        $this->assertDoesNotMatchRegularExpression('~[+/=]~', $token);
    }

    /**
     * The attack this whole design exists to stop: edit the payload, keep the
     * signature. If this ever passes, the product is trivially pirated.
     */
    public function test_editing_the_payload_invalidates_the_signature(): void
    {
        $this->requireKeys();

        // Issued REVOKED and for someone else's domain, so every edit below is
        // a genuine change of value. (An earlier version of this test "tampered"
        // status from active to active, which of course still verified - the
        // signature was right and the test was wrong.)
        [$token, $payload] = $this->makeToken([
            'domain' => 'customer.com',
            'status' => 'revoked',
        ]);

        $decoded = LicenseTokenCodec::decode($token);

        $attacks = [
            'domain'           => 'evil.com',
            'status'           => 'active',
            'expires_at'       => '2099-01-01T00:00:00+00:00',
            'installation_id'  => 'inst_01aaaaaaaaaaaaaaaaaaaaaaaa',
            'product'          => 'something-else',
        ];

        foreach ($attacks as $field => $value) {
            $this->assertNotSame($payload[$field] ?? null, $value, "Test bug: '{$field}' was not actually changed.");

            $tampered = $payload;
            $tampered[$field] = $value;

            $forged = LicenseTokenCodec::PREFIX
                . '.' . LicenseTokenCodec::b64UrlEncode(json_encode($tampered, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE))
                . '.' . LicenseTokenCodec::b64UrlEncode($decoded['signature']);

            $this->assertFalse($this->verifies($forged), "Tampering with '{$field}' was not rejected.");
        }
    }

    public function test_a_token_signed_by_another_key_is_rejected(): void
    {
        $this->requireKeys();

        $attacker = @openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        openssl_pkey_export($attacker, $attackerPem);

        $payload = ['product' => 'reelsoo', 'domain' => 'evil.com', 'status' => 'active'];
        $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $signature = '';
        openssl_sign($json, $signature, openssl_pkey_get_private($attackerPem), OPENSSL_ALGO_SHA256);

        $forged = LicenseTokenCodec::PREFIX
            . '.' . LicenseTokenCodec::b64UrlEncode($json)
            . '.' . LicenseTokenCodec::b64UrlEncode($signature);

        $this->assertFalse($this->verifies($forged));
    }

    public function test_the_public_key_carries_no_private_material(): void
    {
        $this->requireKeys();

        $this->assertStringContainsString('PUBLIC KEY', $this->publicPem);
        $this->assertStringNotContainsString('PRIVATE', $this->publicPem);
    }

    #[DataProvider('malformedTokens')]
    public function test_malformed_tokens_are_rejected(?string $token): void
    {
        $this->assertNull(LicenseTokenCodec::decode($token));
    }

    public static function malformedTokens(): array
    {
        return [
            'null'            => [null],
            'empty'           => [''],
            'whitespace'      => ['   '],
            'wrong prefix'    => ['XXX1.abc.def'],
            'two parts'       => ['RLS1.abc'],
            'four parts'      => ['RLS1.a.b.c'],
            'bad base64url'   => ['RLS1.!!!!.abc'],
            'non-JSON body'   => ['RLS1.' . 'bm90IGpzb24' . '.abc'],
            'oversized'       => ['RLS1.' . 'aaaa' . str_repeat('a', 20000) . '.b'],
        ];
    }

    // ── Domain binding ───────────────────────────────────────────────────

    #[DataProvider('equivalentDomains')]
    public function test_equivalent_domain_spellings_match(string $candidate): void
    {
        $this->assertTrue(DomainNormalizer::matches('customer.com', $candidate));
    }

    public static function equivalentDomains(): array
    {
        return [
            ['customer.com'],
            ['www.customer.com'],
            ['CUSTOMER.COM'],
            ['https://customer.com'],
            ['https://www.customer.com/'],
            ['http://customer.com:8080/path?q=1'],
            ['customer.com.'],
            ['  customer.com  '],
        ];
    }

    /**
     * The two strings the specification calls out by name, plus the rest of the
     * family. A suffix or substring match would let every one of these through.
     *
     */
    #[DataProvider('hostileDomains')]
    public function test_lookalike_domains_never_satisfy_the_licence(string $candidate): void
    {
        $this->assertFalse(DomainNormalizer::matches('customer.com', $candidate));
    }

    public static function hostileDomains(): array
    {
        return [
            'suffix attack'      => ['customer.com.evil.com'],
            'prefix attack'      => ['evil-customer.com'],
            'concatenation'      => ['evilcustomer.com'],
            'subdomain'          => ['app.customer.com'],
            'tld swap'           => ['customer.co'],
            'tld extension'      => ['customer.company'],
            'embedded'           => ['evil.com/customer.com'],
            'userinfo trick'     => ['customer.com@evil.com'],
            'empty'              => [''],
            'bare ip'            => ['203.0.113.10'],
        ];
    }

    public function test_unparseable_domains_are_never_a_match(): void
    {
        $this->assertFalse(DomainNormalizer::matches('customer.com', null));
        $this->assertFalse(DomainNormalizer::matches(null, 'customer.com'));
        $this->assertFalse(DomainNormalizer::matches(null, null));
    }

    public function test_non_http_schemes_are_refused(): void
    {
        foreach (['ftp://customer.com', 'javascript://customer.com', 'file://customer.com'] as $input) {
            $this->assertNull(DomainNormalizer::normalize($input), $input . ' should not normalise.');
        }
    }
}
