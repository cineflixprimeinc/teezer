<?php

namespace App\Services\AppAttest;

/**
 * The certificate side of attestation verification.
 *
 * Three jobs, all of them things PHP's openssl bindings do not offer directly:
 * chain the leaf back to Apple's root, pull the nonce out of Apple's private
 * certificate extension, and derive the key identifier the way Apple derives
 * it. Everything here operates on a certificate that has NOT yet been trusted,
 * so it is written to fail closed on anything unexpected.
 */
final class AppleCertificate
{
    /**
     * Apple's App Attest nonce extension, OID 1.2.840.113635.100.8.2, as the
     * DER bytes that appear in the certificate.
     *
     *   06 09   OBJECT IDENTIFIER, 9 content bytes
     *   2A      40*1 + 2                       -> 1.2
     *   86 48   base-128, 0x06<<7 | 0x48       -> 840
     *   86 F7 63                               -> 113635
     *   64 08 02                               -> 100, 8, 2
     */
    private const NONCE_OID_DER = "\x06\x09\x2A\x86\x48\x86\xF7\x63\x64\x08\x02";

    /** DER of an ASN.1 header for a 32-byte OCTET STRING. */
    private const OCTET_STRING_32 = "\x04\x20";

    /** @param list<string> $derChain leaf first, then intermediates */
    public static function toPem(string $der): string
    {
        return "-----BEGIN CERTIFICATE-----\n"
            . chunk_split(base64_encode($der), 64, "\n")
            . "-----END CERTIFICATE-----\n";
    }

    /**
     * Verify leaf -> intermediate -> Apple root, including validity dates.
     *
     * openssl_x509_checkpurpose is the only full chain verification PHP
     * exposes, and it insists on reading both the trust anchor and the
     * untrusted intermediates from FILES - hence the temp file, which is
     * removed in every exit path. X509_PURPOSE_ANY because these are not TLS
     * certificates: constraining to a TLS purpose would reject a perfectly
     * valid attestation chain for having the wrong extended key usage.
     *
     * @param list<string> $intermediatePems
     * @throws AppAttestException
     */
    public static function verifyChain(string $leafPem, array $intermediatePems, string $rootCaPath): void
    {
        if (! is_readable($rootCaPath)) {
            // Deliberately fatal rather than "skip the chain check": a missing
            // root must never silently downgrade this to decode-and-trust.
            throw new AppAttestException('root_ca_unreadable');
        }

        $tmp = tempnam(sys_get_temp_dir(), 'aac');
        if ($tmp === false) {
            throw new AppAttestException('tmpfile_failed');
        }

        try {
            file_put_contents($tmp, implode("\n", $intermediatePems));

            $result = openssl_x509_checkpurpose($leafPem, X509_PURPOSE_ANY, [$rootCaPath], $tmp);

            // Tri-state: true trusted, false untrusted, -1 error. Anything that
            // is not exactly true fails.
            if ($result !== true) {
                throw new AppAttestException('chain_untrusted');
            }
        } finally {
            @unlink($tmp);
        }
    }

    /**
     * Pull the 32-byte nonce out of Apple's extension.
     *
     * Parsed straight from the DER rather than via openssl_x509_parse(), whose
     * `extensions` array hands back unknown-OID values as strings that have
     * been through formatting - fine for printable extensions, not something to
     * hang a byte-exact hash comparison on.
     *
     * The extension's own payload is, per Apple:
     *   SEQUENCE { [1] EXPLICIT { OCTET STRING (32 bytes) } }
     * so the nonce is the first 32-byte OCTET STRING that follows the OID.
     *
     * @throws AppAttestException
     */
    public static function nonceFrom(string $der): string
    {
        $oidAt = strpos($der, self::NONCE_OID_DER);
        if ($oidAt === false) {
            throw new AppAttestException('nonce_extension_missing');
        }

        // Bounded search window: the extension is ~40 bytes of wrapper plus the
        // nonce. Scanning to end-of-certificate could otherwise pick up an
        // unrelated 32-byte octet string from a later extension.
        $window = substr($der, $oidAt + strlen(self::NONCE_OID_DER), 64);

        $at = strpos($window, self::OCTET_STRING_32);
        if ($at === false) {
            throw new AppAttestException('nonce_extension_malformed');
        }

        $nonce = substr($window, $at + 2, 32);
        if (strlen($nonce) !== 32) {
            throw new AppAttestException('nonce_extension_truncated');
        }

        return $nonce;
    }

    /**
     * The key identifier, derived exactly as Apple derives it: SHA-256 over the
     * uncompressed EC point (0x04 || X || Y), not over the SPKI wrapper.
     *
     * X and Y are left-padded to 32 bytes each. openssl strips leading zero
     * bytes from the coordinates, so a key whose X happens to start with a zero
     * would otherwise hash to something that never matches - a rare,
     * ~1-in-256 intermittent failure if it were skipped.
     *
     * @throws AppAttestException
     */
    public static function keyIdentifier(string $pem): string
    {
        return hash('sha256', self::publicKeyPoint($pem), true);
    }

    /**
     * The raw uncompressed EC point for the certificate's public key.
     *
     * @throws AppAttestException
     */
    public static function publicKeyPoint(string $pem): string
    {
        $key = openssl_pkey_get_public($pem);
        if ($key === false) {
            throw new AppAttestException('public_key_unreadable');
        }

        $details = openssl_pkey_get_details($key);
        if (! is_array($details) || ($details['type'] ?? null) !== OPENSSL_KEYTYPE_EC) {
            throw new AppAttestException('public_key_not_ec');
        }

        $x = $details['ec']['x'] ?? null;
        $y = $details['ec']['y'] ?? null;
        if (! is_string($x) || ! is_string($y)) {
            throw new AppAttestException('public_key_missing_coordinates');
        }

        return "\x04" . str_pad($x, 32, "\0", STR_PAD_LEFT) . str_pad($y, 32, "\0", STR_PAD_LEFT);
    }

    /**
     * The certificate's public key in PEM form, which is what later assertion
     * verification needs (openssl_verify wants a key, not a point).
     *
     * @throws AppAttestException
     */
    public static function publicKeyPem(string $certPem): string
    {
        $key = openssl_pkey_get_public($certPem);
        if ($key === false) {
            throw new AppAttestException('public_key_unreadable');
        }

        $details = openssl_pkey_get_details($key);
        if (! is_array($details) || ! isset($details['key'])) {
            throw new AppAttestException('public_key_unreadable');
        }

        return (string) $details['key'];
    }
}
