<?php

namespace App\Filesystem;

use App\Services\MediaPresignService;
use Illuminate\Filesystem\AwsS3V3Adapter;

/**
 * A disk whose url() returns a SIGNED CDN link.
 *
 * The media origin requires a token on every path, so any plain
 * Storage::url($key) is a 403 and a blank image. There were 65 such call sites
 * across the app - avatars, story covers, music artwork, notification images,
 * admin previews - and fixing them one by one would have meant finding all 65,
 * getting each right, and catching every new one written afterwards.
 *
 * Overriding url() once means every existing and future caller gets a working
 * link without knowing signing exists. Callers that genuinely want the raw
 * object path still have the key they passed in.
 *
 * Only url() changes. Everything else - reads, writes, deletes, temporaryUrl,
 * getClient() for presigned uploads - is the stock S3 adapter.
 *
 * It MUST extend AwsS3V3Adapter, not FilesystemAdapter. getClient() is declared
 * on AwsS3V3Adapter alone; from FilesystemAdapter the call falls through
 * __call() to the underlying League\Flysystem\Filesystem, which has no such
 * method, and every presigned upload dies with
 * "Call to undefined method League\Flysystem\Filesystem::getClient()" - a 500
 * on the client with no hint that storage is the cause. That is exactly what
 * broke uploads, so the parent class here is load-bearing.
 */
class SignedFilesystemAdapter extends AwsS3V3Adapter
{
    public function url($path)
    {
        // Some older rows store a full absolute URL rather than an object key -
        // music cover_url is the main offender. Prefixing the CDN host onto one
        // of those produced "cdn.reelsoo.com/https://media.reelsoo.com/...",
        // which is a 404, and passing it through unchanged is a 403 because the
        // host it names now requires a token. Recovering the key and signing it
        // repairs both without a data migration.
        $path = $this->toKey($path);

        // The flag exists so local dev, and any future setup that serves the
        // bucket without an edge signer, keeps emitting plain URLs - which are
        // correct there, because nothing is checking them.
        if (! config('services.media.signed_urls', true)) {
            return parent::url($path);
        }

        return MediaPresignService::signedMediaUrl($path);
    }

    /**
     * Reduce a stored value to a bare object key.
     *
     * Keys pass through untouched. An absolute URL has its scheme, host, query
     * and any /file/{bucket} segment stripped - that prefix being B2's own,
     * which the disk re-adds when it builds the public URL, so leaving it in
     * would double it.
     */
    private function toKey(string $path): string
    {
        if (! preg_match('#^https?://#i', $path)) {
            return $path;
        }

        $key = ltrim((string) parse_url($path, PHP_URL_PATH), '/');

        $bucket = (string) ($this->config['bucket'] ?? '');
        if ($bucket !== '' && str_starts_with($key, "file/{$bucket}/")) {
            $key = substr($key, strlen("file/{$bucket}/"));
        } elseif ($this->isLegacyMediaHost((string) parse_url($path, PHP_URL_HOST))) {
            // Rows restored from the legacy (reelsoo.com) database may carry
            // B2's /file/{bucket}/ prefix for a bucket name that is not ours.
            // Strip whichever bucket name is there so the key resolves in the
            // current bucket and is re-served through our own MEDIA_URL.
            $key = (string) preg_replace('#^file/[A-Za-z0-9-]+/#', '', $key);
        }

        return $key;
    }

    /**
     * Hosts that absolute URLs in legacy rows can name: the old reelsoo.com
     * media hosts (cdn./media.) and B2's own download hosts.
     */
    private function isLegacyMediaHost(string $host): bool
    {
        $host = strtolower($host);

        return $host === 'reelsoo.com'
            || str_ends_with($host, '.reelsoo.com')
            || str_ends_with($host, '.backblazeb2.com');
    }
}
