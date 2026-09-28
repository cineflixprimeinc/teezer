<?php

namespace App\Services;

use Aws\S3\S3Client;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Generates short-lived presigned URLs against the active media bucket so the
 * browser can PUT files directly without proxying through Laravel.
 *
 * The class name says R2 and the active bucket may well be Backblaze B2 - the
 * name is kept only because a dozen controllers type-hint it, and a rename buys
 * nothing but churn. Everything below resolves the disk through mediaDisk()
 * rather than naming 'r2', so FILESYSTEM_DISK decides which provider gets the
 * PUT. Both are S3-compatible and share one key layout, so nothing else moves.
 *
 * Object key layout matches the spec:
 *   videos/original/{user_id}/{YYYY}/{MM}/{uuid}.{ext}
 *   thumbnails/{user_id}/{YYYY}/{MM}/{uuid}.{ext}
 *   profile/{user_id}/{uuid}.{ext}
 *   temp/{user_id}/{uuid}.{ext}
 *
 * Embedding the user id in the prefix lets `completeUpload()` reject keys that
 * weren't issued to the caller - a cheap server-side check that doesn't need
 * a separate "pending upload" table.
 */
class MediaPresignService
{
    public function __construct() {}

    /**
     * Build a presigned PUT URL the browser can upload to.
     * Returns ['upload_url' => string, 'object_key' => string, 'expires_in' => int].
     */
    public function createUploadUrl(
        int    $userId,
        string $fileName,
        string $contentType,
        string $directory = 'videos/original',
        int    $expiresMinutes = 10,
    ): array {
        $key = $this->generateObjectKey($userId, $fileName, $directory);

        // Bucket follows the key: a chat upload is presigned against the private
        // bucket, a video against the public one, with no branch at the caller.
        $client = $this->client($key);
        $bucket = $this->bucket($key);

        $cmd = $client->getCommand('PutObject', [
            'Bucket'      => $bucket,
            'Key'         => $key,
            'ContentType' => $contentType,
        ]);

        $request = $client->createPresignedRequest($cmd, "+{$expiresMinutes} minutes");

        return [
            'upload_url'  => (string) $request->getUri(),
            'object_key'  => $key,
            'expires_in'  => $expiresMinutes * 60,
            'content_type'=> $contentType,
        ];
    }

    /* ── Multipart / resumable uploads ──────────────────────────────────────
     *
     * A single presigned PUT is fine for a photo and wrong for a 500 MB video
     * on a phone: one dropped connection at 90% throws away the whole upload,
     * and mobile networks drop connections. Multipart splits the file into
     * independently-signed parts, so a failure costs one part instead of the
     * file, and parts can go up concurrently.
     *
     * Resumability falls out of the same mechanism rather than needing its own:
     * B2 remembers which parts of an upload id it already holds, so a client
     * that died mid-upload asks listParts() what landed and sends only the
     * rest. That is why no "pending upload" table exists here - the object
     * store is already the source of truth, and a second copy of that state in
     * Postgres could only ever disagree with it.
     */

    /** B2's minimum part size is 5 MB; 8 keeps part counts sane on big files. */
    public const PART_SIZE = 8 * 1024 * 1024;

    /**
     * Begin a multipart upload. Returns the key the client must reuse for every
     * subsequent call, plus the part size it must chunk to.
     */
    public function createMultipartUpload(
        int    $userId,
        string $fileName,
        string $contentType,
        string $directory = 'videos/original',
    ): array {
        $key = $this->generateObjectKey($userId, $fileName, $directory);

        $res = $this->client($key)->createMultipartUpload([
            'Bucket'      => $this->bucket($key),
            'Key'         => $key,
            'ContentType' => $contentType,
        ]);

        return [
            'object_key'   => $key,
            'upload_id'    => (string) $res['UploadId'],
            'part_size'    => self::PART_SIZE,
            'content_type' => $contentType,
        ];
    }

    /**
     * Presign one part. Signed individually and on demand rather than handing
     * out every part URL up front: a 500 MB file is 60+ parts, most of a
     * response the client may never use, and each URL would start expiring the
     * moment it was issued rather than when the client actually reaches it.
     */
    public function signUploadPart(string $key, string $uploadId, int $partNumber, int $expiresMinutes = 60): string
    {
        $cmd = $this->client($key)->getCommand('UploadPart', [
            'Bucket'     => $this->bucket($key),
            'Key'        => $key,
            'UploadId'   => $uploadId,
            'PartNumber' => $partNumber,
        ]);

        return (string) $this->client($key)->createPresignedRequest($cmd, "+{$expiresMinutes} minutes")->getUri();
    }

    /**
     * Parts B2 already holds for this upload - the resume answer.
     *
     * @return list<array{PartNumber:int,ETag:string,Size:int}>
     */
    public function listUploadedParts(string $key, string $uploadId): array
    {
        $out    = [];
        $marker = 0;

        // Paginated because a large file exceeds the 1000-part page and a
        // truncated list would silently tell the client to re-send parts that
        // are already there.
        do {
            $res = $this->client($key)->listParts([
                'Bucket'           => $this->bucket($key),
                'Key'              => $key,
                'UploadId'         => $uploadId,
                'PartNumberMarker' => $marker,
            ]);

            foreach ($res['Parts'] ?? [] as $p) {
                $out[] = [
                    'PartNumber' => (int) $p['PartNumber'],
                    'ETag'       => (string) $p['ETag'],
                    'Size'       => (int) ($p['Size'] ?? 0),
                ];
            }

            $marker = (int) ($res['NextPartNumberMarker'] ?? 0);
        } while (($res['IsTruncated'] ?? false) && $marker > 0);

        return $out;
    }

    /**
     * Finish the upload. $parts must be every part, ascending by PartNumber,
     * each with the ETag B2 returned for it.
     */
    public function completeMultipartUpload(string $key, string $uploadId, array $parts): void
    {
        usort($parts, fn ($a, $b) => $a['PartNumber'] <=> $b['PartNumber']);

        $this->client($key)->completeMultipartUpload([
            'Bucket'          => $this->bucket($key),
            'Key'             => $key,
            'UploadId'        => $uploadId,
            'MultipartUpload' => ['Parts' => array_map(fn ($p) => [
                'PartNumber' => (int) $p['PartNumber'],
                'ETag'       => (string) $p['ETag'],
            ], $parts)],
        ]);
    }

    /**
     * Abandon an upload and release the parts already stored.
     *
     * Worth calling on cancel: abandoned parts are billed like any other stored
     * bytes and are invisible in a normal bucket listing, so they accumulate
     * silently and nobody notices until the bill does.
     */
    public function abortMultipartUpload(string $key, string $uploadId): void
    {
        $this->client($key)->abortMultipartUpload([
            'Bucket'   => $this->bucket($key),
            'Key'      => $key,
            'UploadId' => $uploadId,
        ]);
    }

    /**
     * In-progress multipart uploads on the given directory's bucket - the
     * client never called complete() or abort() on these, so B2 is still
     * billing every part already uploaded with nothing to show for it. Used
     * by the scheduled cleanup (videos:abort-stale-multipart-uploads) to find
     * and abort ones old enough that the client clearly isn't coming back.
     *
     * @return list<array{Key:string,UploadId:string,Initiated:\DateTimeInterface}>
     */
    public function listInProgressMultipartUploads(string $directory): array
    {
        // Any real key under this directory resolves the right bucket/client -
        // the directory alone doesn't carry a user id, so a placeholder key is
        // enough just to pick the disk.
        $probeKey = rtrim($directory, '/') . '/0';
        $out      = [];
        $keyMarker = null;
        $uploadIdMarker = null;

        do {
            $params = [
                'Bucket' => $this->bucket($probeKey),
                'Prefix' => rtrim($directory, '/') . '/',
            ];
            if ($keyMarker !== null) $params['KeyMarker'] = $keyMarker;
            if ($uploadIdMarker !== null) $params['UploadIdMarker'] = $uploadIdMarker;

            $res = $this->client($probeKey)->listMultipartUploads($params);

            foreach ($res['Uploads'] ?? [] as $u) {
                $out[] = [
                    'Key'       => (string) $u['Key'],
                    'UploadId'  => (string) $u['UploadId'],
                    'Initiated' => $u['Initiated'],
                ];
            }

            $keyMarker      = $res['NextKeyMarker'] ?? null;
            $uploadIdMarker = $res['NextUploadIdMarker'] ?? null;
        } while ($res['IsTruncated'] ?? false);

        return $out;
    }

    /**
     * Build a presigned GET URL for private files (e.g. verification docs).
     */
    public function createReadUrl(string $key, int $expiresMinutes = 60): string
    {
        $cmd = $this->client($key)->getCommand('GetObject', [
            'Bucket' => $this->bucket($key),
            'Key'    => $key,
        ]);
        return (string) $this->client($key)->createPresignedRequest($cmd, "+{$expiresMinutes} minutes")->getUri();
    }

    /**
     * Confirm a key exists in the bucket. Used by completeUpload() to verify
     * the browser actually finished its PUT before we save the DB row.
     */
    public function objectExists(string $key): bool
    {
        return Storage::disk($this->mediaDisk($key))->exists($key);
    }

    /**
     * Returns true iff the key starts with the prefix issued for this user
     * (e.g. videos/original/123/...). Cheap auth check.
     */
    public function keyBelongsToUser(string $key, int $userId, string $directory = 'videos/original'): bool
    {
        $prefix = rtrim($directory, '/') . "/{$userId}/";
        return Str::startsWith($key, $prefix);
    }

    /**
     * Generate a safe random key under the requested directory. The user's
     * filename never appears in the object key - only its extension.
     */
    public function generateObjectKey(int $userId, string $fileName, string $directory): string
    {
        $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION) ?: 'bin');
        // Whitelist a small set of extensions so a malformed filename can't sneak in '../' etc.
        if (!preg_match('/^[a-z0-9]{1,5}$/', $ext)) {
            $ext = 'bin';
        }
        $dir = trim($directory, '/');
        $y = now()->format('Y');
        $m = now()->format('m');
        $uuid = (string) Str::uuid();
        return "{$dir}/{$userId}/{$y}/{$m}/{$uuid}.{$ext}";
    }

    /**
     * Resolve the public URL (custom domain or signed) for a stored key.
     */
    public function publicUrl(string $key): string
    {
        return Storage::disk($this->mediaDisk($key))->url($key);
    }

    /**
     * The URL a client should use to fetch this key.
     *
     * Three cases, and which one applies is decided by the key and by whether a
     * signing edge still exists:
     *
     *  1. Private key (identity document, chat media) - a presigned B2 link
     *     against the private bucket, valid for minutes. Never cacheable, never
     *     public, works with no edge component at all.
     *
     *  2. Public key while MEDIA_SIGNED_URLS is on - a CDN URL carrying an
     *     HMAC token, validated by the Cloudflare Worker. This is the old
     *     arrangement and stays available so the Worker can be reinstated.
     *
     *  3. Public key with MEDIA_SIGNED_URLS off - a plain CDN URL. Correct once
     *     the bucket is public and Cloudflare caches it directly, because there
     *     is then nothing at the edge to check a token and appending one would
     *     just be noise that fragments the cache.
     *
     * The flag is what makes deleting the Worker a config change rather than a
     * code change, and what makes putting it back equally cheap.
     *
     * Signing protocol (must match the Worker's verifyHmac):
     *   message = "/{key}|{unix_expires}"
     *   token   = hash_hmac('sha256', message, MEDIA_SIGNING_SECRET) → hex
     */
    public function signedCdnUrl(string $key, int $ttlMinutes = 1440): string
    {
        if (StorageService::isPrivateKey($key)
            && config('filesystems.disks.b2_private.key')
            && config('filesystems.disks.b2_private.bucket')) {
            return $this->createReadUrl($key, $ttlMinutes);
        }

        if (! config('services.media.signed_urls', true)) {
            return $this->publicUrl($key);
        }

        return self::signedMediaUrl($key, $ttlMinutes);
    }

    /**
     * A signed CDN URL in the exact shape nginx's secure_link module validates.
     *
     *   token = base64url( md5_raw( expires . uri . secret ) )
     *
     * This is md5 and not something stronger because secure_link_md5 is what
     * stock nginx implements, and the alternative is compiling a Lua module
     * onto the media origin to verify an HMAC. The token is not protecting a
     * secret - it is a short-lived capability to fetch one object - so a
     * preimage attack on md5 is not the threat, guessing an unguessable URL is,
     * and the secret makes that infeasible either way.
     *
     * Static so the HLS playlist controller can sign each segment line without
     * pulling in an S3 client it has no use for.
     */
    public static function signedMediaUrl(string $key, int $ttlMinutes = 1440): string
    {
        $base    = rtrim((string) config('filesystems.disks.b2.url'), '/');
        $path    = '/' . ltrim($key, '/');
        $expires = self::windowedExpiry($ttlMinutes);

        return $base . $path . '?' . http_build_query([
            'expires' => $expires,
            'token'   => self::signToken($path, $expires),
        ]);
    }

    /**
     * Every request for the same key used to get its own `expires` (`now()
     * + ttl`), so the query string - and therefore the token - was different
     * every single time, even a second later for the identical object. That
     * is invisible to nginx's own local cache (proxy_cache_key is "$uri",
     * token excluded on purpose - see deploy/nginx/teezer-media.conf), but
     * Cloudflare's edge cache key is the full URL including the query
     * string: confirmed live that a re-signed URL for a still-cached object
     * comes back cf-cache-status: MISS, forcing a fresh round trip to the
     * single origin VPS instead of the nearest edge PoP on effectively every
     * feed load, HLS playlist refresh, or profile revisit.
     *
     * The fix is a fixed grid instead of a rolling one: round the expiry UP
     * to the next multiple of SIGNING_WINDOW_SECONDS (anchored to the Unix
     * epoch, not to $now), so two calls for the same key landing in the same
     * window get the identical `expires` and therefore the identical token
     * - a re-signed URL becomes a cache hit again instead of a new object.
     * Crossing into the next window still mints a new token, same as before.
     *
     * The TTL floor is never violated: ceil() only rounds up, so the result
     * is always >= now()+$ttlMinutes. Worst case a token outlives its
     * nominal TTL by under SIGNING_WINDOW_SECONDS - negligible next to the
     * 2h/4h/24h TTLs actually in use, and unrelated to nginx's own
     * secure_link_md5 check, which only recomputes the hash from whatever
     * `expires` it's handed - it has no opinion on how that value was
     * derived, so this needed no nginx-side change.
     */
    private static function windowedExpiry(int $ttlMinutes): int
    {
        $window    = self::SIGNING_WINDOW_SECONDS;
        $minExpiry = now()->timestamp + ($ttlMinutes * 60);

        return (int) (ceil($minExpiry / $window) * $window);
    }

    /**
     * Grid size for windowedExpiry(). 15 minutes: coarse enough that two
     * feed/playlist requests seconds (or several minutes) apart collapse
     * onto the same signed URL, matching the HLS playlist's own 5-minute
     * edge Cache-Control (deploy/nginx/teezer-media.conf's `.m3u8` branch)
     * so segment tokens stay stable for at least one playlist cache cycle;
     * fine-grained enough that the shortest TTL in use (120 min, private/
     * draft) is never meaningfully over-extended (worst case +15 min, ~12%).
     */
    private const SIGNING_WINDOW_SECONDS = 900;

    /** The token half of signedMediaUrl, for callers that build their own URL. */
    public static function signToken(string $path, int $expires): string
    {
        $secret = (string) config('services.media.signing_secret', '');

        // Raw binary md5, base64 with the URL-safe alphabet and no padding -
        // byte-for-byte what secure_link_md5 computes on the nginx side. Any
        // deviation here (hex, standard base64, trailing '=') is a 403 on every
        // request with nothing in the logs explaining why.
        return rtrim(strtr(base64_encode(md5($expires . $path . $secret, true)), '+/', '-_'), '=');
    }

    /**
     * The S3-compatible disk that new uploads go to: 'r2' or 'b2', whichever
     * FILESYSTEM_DISK selects.
     *
     * Local dev runs FILESYSTEM_DISK=local|public, which has no presign support
     * at all. Rather than hand back a local disk that would fatal on getClient(),
     * fall back to 'r2' - it keeps the previous behaviour exactly for anyone
     * who has R2 credentials in a dev .env, and fails with a recognisable
     * credentials error rather than a confusing method-missing one for anyone
     * who does not.
     */
    private function mediaDisk(string $key = ''): string
    {
        // Sensitive prefixes live in a separate, permanently private bucket -
        // the main one is public so Cloudflare can cache straight from B2. The
        // decision is StorageService's so there is exactly one place that knows
        // which prefixes are private.
        if ($key !== '' && StorageService::isPrivateKey($key)
            && config('filesystems.disks.b2_private.key')
            && config('filesystems.disks.b2_private.bucket')) {
            return 'b2_private';
        }

        $disk = (string) config('filesystems.default', 'b2');

        return in_array($disk, ['b2', 'b2_private'], true) ? $disk : 'b2';
    }

    /** Underlying AWS SDK S3 client wired to the active media disk. */
    private function client(string $key = ''): S3Client
    {
        // Laravel exposes the underlying client on the S3 driver.
        /** @var S3Client $client */
        $client = Storage::disk($this->mediaDisk($key))->getClient();
        return $client;
    }

    private function bucket(string $key = ''): string
    {
        return (string) config('filesystems.disks.' . $this->mediaDisk($key) . '.bucket');
    }
}
