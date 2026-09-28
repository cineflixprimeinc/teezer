<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

/**
 * Configure Backblaze B2 bucket CORS so browsers can PUT files directly.
 *
 * The browser-to-bucket direct upload flow requires:
 *   - PUT allowed from the frontend origin(s)
 *   - Content-Type allowed (the browser sets it to the file's MIME type)
 *
 * Only UPLOADS need this. Downloads never touch the bucket origin - they go
 * through media.reelsoo.com, where the Worker sets its own CORS headers - so a
 * missing rule here breaks uploads while playback carries on working, which is
 * a confusing way to find out the rule is missing.
 *
 * This talks to B2's NATIVE API rather than the S3-compatible one, because
 * Backblaze does not implement PutBucketCors on the S3 endpoint at all. The
 * AWS SDK call that used to do this against R2 fails with an unhelpful error
 * here, which is why the whole command is HTTP rather than SDK.
 *
 * Run once after provisioning or when switching origins:
 *   php artisan media:cors
 */
class MediaSetCors extends Command
{
    protected $signature   = 'media:cors {--dry-run : Print the rules without applying them}';
    protected $description = 'Apply CORS rules to the B2 bucket so browsers can upload directly';

    private const AUTH_URL  = 'https://api.backblazeb2.com/b2api/v3/b2_authorize_account';
    private const RULE_NAME = 'reelsooDirectUpload';

    public function handle(): int
    {
        $keyId  = (string) config('filesystems.disks.b2.key');
        $appKey = (string) config('filesystems.disks.b2.secret');
        $bucket = (string) config('filesystems.disks.b2.bucket');

        if (!$keyId || !$appKey || !$bucket) {
            $this->error('B2 is not configured - set B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY and B2_BUCKET.');
            return self::FAILURE;
        }

        $origins = array_values(array_filter((array) config('cors.allowed_origins', [])));

        // Always include localhost for local dev
        $origins = array_values(array_unique(array_merge($origins, [
            'http://localhost:3000',
            'http://localhost:3001',
        ])));

        // B2 rejects "*" alongside explicit origins, so catch that here rather
        // than reading it out of a 400 with no field name in it.
        if (in_array('*', $origins, true) && count($origins) > 1) {
            $this->error('cors.allowed_origins mixes "*" with explicit origins; B2 rejects that combination.');
            return self::FAILURE;
        }

        $rules = [[
            'corsRuleName'      => self::RULE_NAME,
            'allowedOrigins'    => $origins,
            // s3_* operations, because uploads use the S3-compatible endpoint
            // even though this rule is set through the native API.
            'allowedOperations' => ['s3_put', 's3_get', 's3_head'],
            'allowedHeaders'    => ['content-type', 'content-length', 'authorization', 'x-amz-*'],
            'exposeHeaders'     => ['etag'],
            'maxAgeSeconds'     => 3600,
        ]];

        $this->line('  Bucket : ' . $bucket);
        $this->line('  Origins: ' . implode(', ', $origins));

        if ($this->option('dry-run')) {
            $this->info('Dry run - rules NOT applied:');
            $this->line(json_encode($rules, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
            return self::SUCCESS;
        }

        try {
            // GET, not POST. b2_authorize_account takes no body, and Laravel
            // serialises an empty POST payload as `[]` - which B2 rejects with
            // "object should start with brace but found: [", an error that
            // reads like a credentials problem and is not one.
            $auth = Http::withBasicAuth($keyId, $appKey)->get(self::AUTH_URL);
            if (!$auth->successful()) {
                $this->error('B2 authorize failed: ' . $auth->status() . ' ' . $auth->body());
                return self::FAILURE;
            }

            $authToken = $auth->json('authorizationToken');
            $accountId = $auth->json('accountId');
            // v3 nests the storage endpoint; v2 returned apiUrl at the top level.
            $apiUrl    = rtrim($auth->json('apiInfo.storageApi.apiUrl') ?? $auth->json('apiUrl') ?? '', '/');

            if (!$authToken || !$accountId || !$apiUrl) {
                $this->error('B2 authorize returned an unexpected shape - could not read apiUrl/accountId.');
                return self::FAILURE;
            }

            $list = Http::withHeaders(['Authorization' => $authToken])
                ->post("{$apiUrl}/b2api/v3/b2_list_buckets", [
                    'accountId'  => $accountId,
                    'bucketName' => $bucket,
                ]);

            if (!$list->successful()) {
                $this->error('B2 list_buckets failed: ' . $list->status() . ' ' . $list->body());
                return self::FAILURE;
            }

            $bucketId = $list->json('buckets.0.bucketId');
            if (!$bucketId) {
                // An application key scoped to one bucket still lists that
                // bucket, so an empty result really does mean the name is wrong.
                $this->error("Bucket '{$bucket}' not found on this account.");
                return self::FAILURE;
            }

            $update = Http::withHeaders(['Authorization' => $authToken])
                ->post("{$apiUrl}/b2api/v3/b2_update_bucket", [
                    'accountId' => $accountId,
                    'bucketId'  => $bucketId,
                    'corsRules' => $rules,
                ]);

            if (!$update->successful()) {
                $this->error('B2 update_bucket failed: ' . $update->status() . ' ' . $update->body());
                return self::FAILURE;
            }

            $this->info('CORS rules applied successfully.');
            $this->line('  Methods: PUT, GET, HEAD');
            $this->line('  Headers: content-type, content-length, authorization, x-amz-*');
            return self::SUCCESS;
        } catch (\Throwable $e) {
            $this->error('Failed to apply CORS rules: ' . $e->getMessage());
            return self::FAILURE;
        }
    }
}
