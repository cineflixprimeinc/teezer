<?php

namespace App\Services\AppAttest;

/**
 * The fixed-layout blob Apple signs over, in both attestations and assertions.
 *
 * Layout (WebAuthn's authenticator data, which App Attest reuses):
 *
 *   0..31   rpIdHash      SHA-256 of the App ID, "<TeamID>.<BundleID>"
 *   32      flags         bit 6 (0x40) set when attested credential data follows
 *   33..36  signCount     big-endian uint32 - the replay counter
 *   -- only when flags & 0x40, i.e. attestations, never assertions --
 *   37..52  aaguid        16 bytes; "appattest" or "appattestdevelop"
 *   53..54  credIdLen     big-endian uint16
 *   55..    credentialId  credIdLen bytes; for App Attest this is the key id
 *   ...     COSE key      the attested public key (unused - the real key is
 *                         taken from the certificate, which is chain-verified)
 *
 * Parsing is strict about length. Every field is read only after checking the
 * buffer actually contains it, so a truncated or padded blob is rejected here
 * rather than producing a silently wrong hash comparison further down.
 */
final class AuthenticatorData
{
    private function __construct(
        public readonly string $raw,
        public readonly string $rpIdHash,
        public readonly int $flags,
        public readonly int $signCount,
        public readonly ?string $aaguid,
        public readonly ?string $credentialId,
    ) {}

    /** @throws AppAttestException */
    public static function parse(string $raw): self
    {
        // 37 is the minimum: hash + flags + counter. An assertion is exactly
        // this length; anything shorter cannot be authenticator data at all.
        if (strlen($raw) < 37) {
            throw new AppAttestException('authdata_too_short');
        }

        $rpIdHash  = substr($raw, 0, 32);
        $flags     = ord($raw[32]);
        $signCount = unpack('N', substr($raw, 33, 4))[1];

        $aaguid = null;
        $credId = null;

        // Bit 6: attested credential data present. Set on an attestation,
        // clear on an assertion.
        if (($flags & 0x40) !== 0) {
            if (strlen($raw) < 55) {
                throw new AppAttestException('authdata_missing_credential_data');
            }

            $aaguid    = substr($raw, 37, 16);
            $credIdLen = unpack('n', substr($raw, 53, 2))[1];

            if ($credIdLen <= 0 || strlen($raw) < 55 + $credIdLen) {
                throw new AppAttestException('authdata_bad_credential_length');
            }

            $credId = substr($raw, 55, $credIdLen);
        }

        return new self($raw, $rpIdHash, $flags, $signCount, $aaguid, $credId);
    }

    /**
     * Which App Attest environment produced this.
     *
     * Apple encodes it in the aaguid as ASCII, zero-padded: "appattestdevelop"
     * fills all 16 bytes, production is "appattest" followed by seven NULs.
     * This is the ONLY trustworthy source of the environment - it is inside the
     * data the certificate chain vouches for, unlike anything the client says.
     */
    public function environment(): ?string
    {
        if ($this->aaguid === null) {
            return null;
        }

        return match (rtrim($this->aaguid, "\0")) {
            'appattestdevelop' => 'development',
            'appattest'        => 'production',
            default            => null,
        };
    }
}
