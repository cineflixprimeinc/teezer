<?php

namespace App\Licensing\Server;

use App\Models\License;
use App\Models\LicenseRelease;
use Illuminate\Support\Facades\Storage;

/**
 * Turns "this licence is entitled to this release" into a short-lived,
 * single-object download URL.
 *
 * The B2 bucket stays PRIVATE and its credentials never leave this server.
 * What the customer receives is a presigned URL: a signed, expiring grant for
 * exactly one object. It is not a credential, it cannot be used to list the
 * bucket, it cannot reach another customer's package, and it stops working on
 * its own after a few minutes.
 *
 * That is the difference between this and the naive approach of handing the
 * installer a read-only B2 key: a key is a standing grant to everything it can
 * see, and once it is on a customer VPS it is effectively published.
 *
 * LICENSOR-SIDE ONLY - excluded from the marketplace package.
 */
class ReleaseAuthorizer
{
    public function __construct(
        private readonly string $disk,
        private readonly int $urlTtlMinutes,
    ) {}

    /**
     * @return array{ok: bool, code: string, message: string, ...}
     */
    public function authorize(License $license, ?string $requestedVersion = null, string $channel = 'stable'): array
    {
        if (! $license->isIssuable()) {
            return [
                'ok'      => false,
                'code'    => 'LICENSE_' . strtoupper($license->status),
                'message' => 'This licence is ' . $license->status . ' and cannot download updates.',
            ];
        }

        $release = $requestedVersion !== null
            ? LicenseRelease::where('version', $requestedVersion)->where('channel', $channel)->where('is_published', true)->first()
            : LicenseRelease::latestPublished($channel);

        if ($release === null) {
            return ['ok' => false, 'code' => 'RELEASE_NOT_FOUND', 'message' => 'No published release is available.'];
        }

        $storage = Storage::disk($this->disk);

        if (! $storage->exists($release->object_key)) {
            // A catalogue row without an object behind it is our bug, not the
            // customer's. Say so generically and let the logs carry the detail.
            return ['ok' => false, 'code' => 'RELEASE_UNAVAILABLE', 'message' => 'This release is temporarily unavailable.'];
        }

        try {
            $url = $storage->temporaryUrl($release->object_key, now()->addMinutes($this->urlTtlMinutes));
        } catch (\Throwable) {
            // temporaryUrl throws when the driver cannot sign (a local disk in
            // development, say). Never leak the driver error to a customer.
            return ['ok' => false, 'code' => 'RELEASE_UNAVAILABLE', 'message' => 'This release is temporarily unavailable.'];
        }

        return [
            'ok'            => true,
            'code'          => 'AUTHORIZED',
            'message'       => 'Download authorised.',
            'version'       => $release->version,
            'channel'       => $release->channel,
            'download_url'  => $url,
            'expires_in'    => $this->urlTtlMinutes * 60,
            'checksum'      => $release->checksum_sha256,
            'signature'     => $release->signature,
            'size_bytes'    => $release->size_bytes,
            'is_mandatory'  => $release->is_mandatory,
            'release_notes' => $release->release_notes,
        ];
    }
}
