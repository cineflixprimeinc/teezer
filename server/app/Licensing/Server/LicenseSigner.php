<?php

namespace App\Licensing\Server;

use App\Licensing\Support\LicenseTokenCodec;

/**
 * Signs licence tokens with the RSA private key.
 *
 * THIS FILE IS THE CROWN JEWEL AND NEVER SHIPS.
 *
 * app/Licensing/Server is excluded wholesale from the marketplace package
 * (see scripts/build-marketplace-release.sh and .marketplace-exclude), so a
 * customer receives the verifier and the public key but never the code that
 * mints a licence. Even if they did, it would be inert: the private key lives
 * at a path outside the repository, is never committed, never packaged, never
 * copied to a customer VPS, never returned by an endpoint, and never written
 * to a log.
 *
 * The private key is read fresh on each sign and the handle is discarded
 * immediately. It is deliberately never cached in a property, a static, the
 * config cache or the application container, so it cannot end up in a var_dump,
 * a serialised job payload, a queued exception context, or a debug page.
 *
 * LICENSOR-SIDE ONLY.
 */
class LicenseSigner
{
    public function __construct(
        private readonly string $privateKeyPath,
        private readonly ?string $passphrase = null,
    ) {}

    public function isConfigured(): bool
    {
        return is_file($this->privateKeyPath) && is_readable($this->privateKeyPath);
    }

    /**
     * Sign a payload and return the wire-format token.
     *
     * The bytes handed to openssl_sign are the exact bytes the token carries -
     * LicenseTokenCodec::encode is not allowed to re-serialise them - so the
     * verifier can check the signature against what it actually received. See
     * that class's docblock for why a re-encode round trip is a bug, not an
     * optimisation.
     */
    public function sign(array $payload): string
    {
        $key = $this->privateKey();

        try {
            $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

            if ($json === false) {
                throw new \RuntimeException('Licence payload could not be encoded.');
            }

            $signature = '';

            if (! openssl_sign($json, $signature, $key, OPENSSL_ALGO_SHA256)) {
                // Deliberately does not include the OpenSSL error queue: it can
                // echo key material back in some builds, and this message goes
                // into a log.
                throw new \RuntimeException('Licence signing failed.');
            }

            return LicenseTokenCodec::PREFIX
                . '.' . LicenseTokenCodec::b64UrlEncode($json)
                . '.' . LicenseTokenCodec::b64UrlEncode($signature);
        } finally {
            unset($key);
        }
    }

    /**
     * Sign an arbitrary string - used for release-package checksums, so a
     * tampered download fails verification even if the transport is hostile.
     */
    public function signRaw(string $data): string
    {
        $key = $this->privateKey();

        try {
            $signature = '';

            if (! openssl_sign($data, $signature, $key, OPENSSL_ALGO_SHA256)) {
                throw new \RuntimeException('Signing failed.');
            }

            return base64_encode($signature);
        } finally {
            unset($key);
        }
    }

    /**
     * The matching public key, derived from the private one. This is what gets
     * written into a customer package. Safe to publish by construction: it can
     * verify a signature and cannot produce one.
     */
    public function publicKeyPem(): string
    {
        $key = $this->privateKey();

        try {
            $details = openssl_pkey_get_details($key);

            if ($details === false || empty($details['key'])) {
                throw new \RuntimeException('Could not derive the public key.');
            }

            return $details['key'];
        } finally {
            unset($key);
        }
    }

    /**
     * @return \OpenSSLAsymmetricKey
     */
    private function privateKey(): \OpenSSLAsymmetricKey
    {
        if (! $this->isConfigured()) {
            throw new \RuntimeException(
                'Licence signing key not found. Run: php artisan license:keygen'
            );
        }

        $pem = @file_get_contents($this->privateKeyPath);

        if ($pem === false || trim($pem) === '') {
            throw new \RuntimeException('Licence signing key could not be read.');
        }

        $key = $this->passphrase !== null && $this->passphrase !== ''
            ? @openssl_pkey_get_private($pem, $this->passphrase)
            : @openssl_pkey_get_private($pem);

        // Zero the PEM string as soon as the key handle exists. PHP strings are
        // immutable so this is best-effort rather than a guarantee, but it
        // shortens the window in which the key sits in a readable variable.
        $pem = str_repeat("\0", 32);
        unset($pem);

        if ($key === false) {
            throw new \RuntimeException('Licence signing key is invalid or the passphrase is wrong.');
        }

        return $key;
    }
}
