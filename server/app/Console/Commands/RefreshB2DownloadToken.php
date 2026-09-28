<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

/**
 * Mint a Backblaze download authorization and hand it to nginx.
 *
 * nginx proxies signed media requests to a PRIVATE B2 bucket, which means every
 * upstream request needs B2 credentials. Stock nginx cannot compute an AWS
 * SigV4 signature - that would need OpenResty/Lua or njs - so it uses B2's
 * native download authorization instead: a bearer token, scoped to a file-name
 * prefix, valid for up to a week, that B2 accepts in a plain Authorization
 * header. One token covers the whole bucket, so nginx just sets a constant.
 *
 * The token is written as an nginx `map` snippet rather than an env var because
 * nginx has no way to read a rotating value from a file at request time. A
 * reload picks it up; a reload is graceful and drops no connections.
 *
 * Schedule daily even though the token lasts seven days. A refresh that fails
 * for six consecutive days is a broken cron nobody noticed; a refresh that
 * fails for six consecutive days AND a token that expired the same afternoon is
 * an outage. The margin is the point.
 *
 *   php artisan media:refresh-b2-token
 */
class RefreshB2DownloadToken extends Command
{
    protected $signature = 'media:refresh-b2-token
                            {--path=/etc/nginx/conf.d/b2_token.conf : Where to write the nginx snippet}
                            {--print : Print the snippet instead of writing it}';

    protected $description = 'Refresh the B2 download authorization nginx uses to reach the private media bucket';

    private const AUTH_URL = 'https://api.backblazeb2.com/b2api/v3/b2_authorize_account';

    /** Seven days is B2's maximum; the daily schedule leaves six days of slack. */
    private const VALID_SECONDS = 604800;

    public function handle(): int
    {
        $keyId  = (string) config('filesystems.disks.b2.key');
        $appKey = (string) config('filesystems.disks.b2.secret');
        $bucket = (string) config('filesystems.disks.b2.bucket');
        $secret = (string) config('services.media.signing_secret');

        foreach (['B2_APPLICATION_KEY_ID' => $keyId, 'B2_APPLICATION_KEY' => $appKey, 'B2_BUCKET' => $bucket] as $name => $v) {
            if ($v === '') {
                $this->error("{$name} is not set.");
                return self::FAILURE;
            }
        }
        if ($secret === '') {
            $this->error('MEDIA_SIGNING_SECRET is not set - nginx cannot validate links without it.');
            return self::FAILURE;
        }

        try {
            // GET, not POST: b2_authorize_account takes no body, and Laravel
            // serialises an empty POST as `[]`, which B2 rejects with an error
            // that reads like bad credentials.
            $auth = Http::withBasicAuth($keyId, $appKey)->timeout(20)->get(self::AUTH_URL);
            if (! $auth->successful()) {
                $this->error('B2 authorize failed: ' . $auth->status() . ' ' . $auth->body());
                return self::FAILURE;
            }

            $token  = (string) $auth->json('authorizationToken');
            $apiUrl = rtrim((string) ($auth->json('apiInfo.storageApi.apiUrl') ?? $auth->json('apiUrl') ?? ''), '/');

            $bucketId = $this->bucketId($apiUrl, $token, (string) $auth->json('accountId'), $bucket);
            if (! $bucketId) {
                $this->error("Bucket '{$bucket}' not found on this account.");
                return self::FAILURE;
            }

            $dl = Http::withHeaders(['Authorization' => $token])->timeout(20)
                ->post("{$apiUrl}/b2api/v3/b2_get_download_authorization", [
                    'bucketId'               => $bucketId,
                    // Empty prefix = the whole bucket. nginx has already checked
                    // the caller's own signature by the time it uses this, so
                    // narrowing the prefix here would buy nothing and would
                    // break the moment a new media folder is added.
                    'fileNamePrefix'         => '',
                    'validDurationInSeconds' => self::VALID_SECONDS,
                ]);

            if (! $dl->successful()) {
                $this->error('B2 download authorization failed: ' . $dl->status() . ' ' . $dl->body());
                return self::FAILURE;
            }

            $downloadToken = (string) $dl->json('authorizationToken');
        } catch (\Throwable $e) {
            $this->error('Could not refresh the token: ' . $e->getMessage());
            return self::FAILURE;
        }

        $snippet = $this->snippet($downloadToken, $bucket, $secret);

        if ($this->option('print')) {
            $this->line($snippet);
            return self::SUCCESS;
        }

        $path = (string) $this->option('path');

        if (! @file_put_contents($path, $snippet)) {
            $this->error("Could not write {$path} - run this as root, or pass --path.");
            return self::FAILURE;
        }
        // The file holds both a bucket credential and the link-signing secret.
        @chmod($path, 0600);

        $this->info("Wrote {$path} (token valid " . round(self::VALID_SECONDS / 86400) . ' days).');
        $this->line('  Now run:  nginx -t && systemctl reload nginx');

        return self::SUCCESS;
    }

    private function bucketId(string $apiUrl, string $token, string $accountId, string $bucket): ?string
    {
        $res = Http::withHeaders(['Authorization' => $token])->timeout(20)
            ->post("{$apiUrl}/b2api/v3/b2_list_buckets", [
                'accountId'  => $accountId,
                'bucketName' => $bucket,
            ]);

        return $res->successful() ? $res->json('buckets.0.bucketId') : null;
    }

    /**
     * nginx `map` blocks rather than plain `set`, because a variable has to be
     * defined at http level to be usable inside the server block that includes
     * conf.d, and `set` is only valid inside server/location.
     */
    private function snippet(string $downloadToken, string $bucket, string $secret): string
    {
        $stamp = now()->toIso8601String();

        return <<<CONF
        # Generated by `php artisan media:refresh-b2-token` at {$stamp}.
        # DO NOT EDIT - rewritten on every refresh. Contains a bucket credential
        # and the media link-signing secret; keep this file 0600 root.
        map \$host \$b2_download_token { default "{$downloadToken}"; }
        map \$host \$b2_bucket         { default "{$bucket}"; }
        map \$host \$media_signing_secret { default "{$secret}"; }

        CONF;
    }
}
