<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Purges specific URLs from Cloudflare's edge cache. Used by
 * PublicMediaMirrorService so a public->private transition (or a re-transcode
 * under a reused HLS key) doesn't have to wait out the edge Cache-Control TTL
 * before it actually stops resolving from a warm PoP.
 *
 * This is NOT the safety mechanism - PublicMediaMirrorService's B2 delete
 * already revokes real access by the time this runs (nginx origin genuinely
 * 404s once the object is gone). Purging only shortens how long an already-
 * cached edge copy can keep answering in the meantime, so every failure mode
 * here is logged and swallowed, never rethrown - a Cloudflare outage or a
 * missing token must not block a video's status from changing.
 *
 * Inert (logs and returns) until CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID
 * are both set - see config/services.php. These are the exact same env var
 * names the admin Integrations settings UI already declares for a
 * (currently unwired) "Cloudflare" entry (config/integrations.php), so
 * pasting a real token in later is a config change, not a code change.
 */
class CloudflarePurgeService
{
    /** Cloudflare's purge_cache endpoint accepts at most this many URLs per call. */
    private const BATCH_SIZE = 30;

    /**
     * @param list<string> $urls Absolute URLs, e.g. https://cdn.reelsoo.com/public/hls/42/master.m3u8
     */
    public function purgeUrls(array $urls): void
    {
        $token = (string) config('services.cloudflare.api_token');
        $zone  = (string) config('services.cloudflare.zone_id');

        if ($urls === []) {
            return;
        }

        if ($token === '' || $zone === '') {
            Log::info('cloudflare.purge_skipped', ['reason' => 'not_configured', 'url_count' => count($urls)]);
            return;
        }

        foreach (array_chunk($urls, self::BATCH_SIZE) as $batch) {
            try {
                $response = Http::withToken($token)
                    ->timeout(10)
                    ->post("https://api.cloudflare.com/client/v4/zones/{$zone}/purge_cache", [
                        'files' => $batch,
                    ]);

                if (! $response->successful()) {
                    Log::warning('cloudflare.purge_failed', [
                        'status' => $response->status(),
                        'body'   => Str::limit($response->body(), 500),
                    ]);
                }
            } catch (\Throwable $e) {
                Log::warning('cloudflare.purge_error', ['error' => $e->getMessage()]);
            }
        }
    }
}
