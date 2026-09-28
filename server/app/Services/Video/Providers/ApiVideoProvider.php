<?php

namespace App\Services\Video\Providers;

use App\Services\Video\Contracts\TranscodingProvider;
use App\Services\Video\Support\ApiVideoRequestException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * The ONLY class in Reelsoo that knows api.video's actual API shapes. Every
 * field/endpoint used here was verified against api.video's live API and
 * OpenAPI spec directly (not assumed from memory) - see the plan/report for
 * the exact verification calls made. VideoProcessingService is the only
 * caller; nothing else should reach into this class.
 *
 * Base URL, auth flow, and every payload shape below were confirmed with
 * real requests against this account on 2026-08-31:
 *   - POST /auth/api-key -> {token_type, expires_in, access_token, refresh_token}
 *   - GET  /videos       -> {context, data, pagination}
 *   - POST /webhooks     -> {webhookId, events, url, createdAt, signatureSecret}
 *
 * Known, deliberate limitation (see the module-level report): api.video has
 * no documented S3/B2-branded ingestion or egress. Source ingestion here
 * uses the generic `source` URL field (confirmed to exist in their OpenAPI
 * spec), and output must be pulled back by TransferEncodedOutputToB2 rather
 * than delivered directly - there is no "export to B2" call to make.
 */
class ApiVideoProvider implements TranscodingProvider
{
    private const BASE_URL = 'https://ws.api.video';

    /** Confirmed via the live docs (docs.api.video/reference/create-and-manage-webhooks). No "failed" quality event is documented - see reconcile() callers for how a stuck job is still caught. */
    private const EVENT_QUALITY_COMPLETED = 'video.encoding.quality.completed';

    public function __construct(
        private readonly string $apiKey,
        private readonly string $webhookSecret,
    ) {
    }

    public function name(): string
    {
        return 'apivideo';
    }

    public function createJob(string $sourceUrl, array $requestedOutputs): string
    {
        $response = $this->request(fn () => $this->client()->post('/videos', [
            'source' => $sourceUrl,
            'public' => false,
            'mp4Support' => true,
        ]), 'create video');

        $videoId = $response->json('videoId');
        if (!is_string($videoId) || $videoId === '') {
            throw new RuntimeException('api.video createJob: response had no videoId');
        }

        return $videoId;
    }

    public function getStatus(string $providerJobId): array
    {
        $response = $this->request(
            fn () => $this->client()->get("/videos/{$providerJobId}/status"),
            'get video status',
        );

        return $response->json() ?? [];
    }

    public function getAssetUrls(string $providerJobId): array
    {
        $response = $this->request(
            fn () => $this->client()->get("/videos/{$providerJobId}"),
            'get video assets',
        );

        $assets = $response->json('assets') ?? [];

        return [
            'hls' => $assets['hls'] ?? null,
            'mp4' => $assets['mp4'] ?? null,
        ];
    }

    public function deleteRemoteAsset(string $providerJobId): void
    {
        try {
            // No retry() here deliberately - a delete's only two outcomes
            // that matter are "gone" and "not gone", and this is best-effort
            // cleanup (see the doc comment on the interface method): a
            // dangling video on api.video that failed to delete costs a
            // little storage, not correctness, so it is not worth burning
            // retry attempts or blocking the caller.
            $response = $this->client(withRetry: false)->delete("/videos/{$providerJobId}");
            if ($response->status() !== 404 && $response->failed()) {
                Log::warning('apivideo.delete_failed', [
                    'provider_job_id' => $providerJobId,
                    'status' => $response->status(),
                ]);
            }
        } catch (ConnectionException $e) {
            Log::warning('apivideo.delete_failed', [
                'provider_job_id' => $providerJobId,
                'error' => $e->getMessage(),
            ]);
        }
    }

    public function verifyWebhookSignature(string $rawBody, ?string $signatureHeader): bool
    {
        if (!$signatureHeader) {
            return false;
        }

        $expected = hash_hmac('sha256', $rawBody, $this->webhookSecret);

        // hash_equals for timing-safe comparison - the whole point of an HMAC
        // check is defeated by a signature comparison an attacker can time.
        return hash_equals($expected, $signatureHeader);
    }

    public function parseWebhookEvent(array $payload): ?array
    {
        $type = $payload['type'] ?? null;

        if ($type !== self::EVENT_QUALITY_COMPLETED) {
            // Not an event this integration acts on (live-stream/caption/summary
            // events - this webhook is scoped to video.encoding.quality.completed
            // only, see the doc comment above).
            return null;
        }

        $videoId = $payload['videoId'] ?? null;
        if (!is_string($videoId) || $videoId === '') {
            return null;
        }

        return [
            'type' => $type,
            'provider_job_id' => $videoId,
            'quality' => $payload['quality'] ?? null,
            'emitted_at' => $payload['emittedAt'] ?? null,
        ];
    }

    /**
     * Cached bearer token, refreshed a minute before its real expiry so a
     * request never races an about-to-expire token. Cache::remember here
     * matches this codebase's existing caching idiom (e.g.
     * HlsPlaylistController's playlist cache) rather than a bespoke
     * in-process singleton, so the token survives across queue worker
     * processes on the same box instead of every job re-authenticating.
     */
    private function accessToken(): string
    {
        return Cache::remember('apivideo:access_token', 3300, function () {
            $response = $this->request(fn () => Http::asJson()->timeout(30)->retry(3, $this->retryDelay(...), $this->shouldRetry(...))
                ->post(self::BASE_URL . '/auth/api-key', ['apiKey' => $this->apiKey]), 'authenticate');

            $token = $response->json('access_token');
            if (!is_string($token) || $token === '') {
                throw new RuntimeException('api.video auth: response had no access_token');
            }

            return $token;
        });
    }

    private function client(bool $withRetry = true)
    {
        $client = Http::baseUrl(self::BASE_URL)
            ->withToken($this->accessToken())
            ->acceptJson()
            ->timeout(30);

        return $withRetry ? $client->retry(3, $this->retryDelay(...), $this->shouldRetry(...)) : $client;
    }

    /**
     * Only retry what retrying can actually fix: a connection-level blip,
     * api.video's own rate limit (429 - will succeed once the window
     * resets), or a provider-side 5xx (may well be transient). A genuine
     * 4xx (bad request, unsupported input, 404, ...) fails identically
     * every time - retrying it only delays the fallback decision for no
     * benefit, and ApiVideoFailureClassifier is what decides what happens
     * next, not this retry loop.
     */
    private function shouldRetry(\Throwable $e): bool
    {
        if ($e instanceof ConnectionException) {
            return true;
        }
        if ($e instanceof RequestException) {
            $status = $e->response->status();
            return $status === 429 || $status >= 500;
        }
        return false;
    }

    /**
     * Milliseconds to wait before the next attempt. On a real 429, honour
     * api.video's own X-RateLimit-Retry-After header exactly (confirmed via
     * their live docs today - this is THEIR header, not the generic
     * Retry-After some APIs use) rather than guessing a backoff curve for a
     * wait time they already told us. Anything else gets a short capped
     * exponential backoff.
     */
    private function retryDelay(int $attempt, \Throwable $e): int
    {
        if ($e instanceof RequestException && $e->response->status() === 429) {
            $retryAfter = $e->response->header('X-RateLimit-Retry-After');
            if (is_numeric($retryAfter)) {
                return ((int) $retryAfter) * 1000;
            }
        }
        return min(500 * (2 ** $attempt), 4000);
    }

    /**
     * Runs one request, converting a failure (after client()'s own
     * retry/backoff has already been exhausted, or immediately for a
     * non-retryable status) into ApiVideoRequestException - carrying the
     * real HTTP status and, on a 429, the real retry-after seconds, so
     * ApiVideoFailureClassifier classifies from actual response data
     * instead of a re-parsed message string.
     */
    private function request(\Closure $send, string $action)
    {
        try {
            return $send();
        } catch (RequestException $e) {
            $status = $e->response->status();
            $retryAfter = $status === 429 ? $e->response->header('X-RateLimit-Retry-After') : null;

            Log::error('apivideo.request_failed', [
                'action' => $action,
                'status' => $status,
                // Never log the response body wholesale - could carry a
                // token on an auth-endpoint failure. Just the parts useful
                // for debugging a real failure.
                'error' => $e->response->json('title') ?? $e->response->json('message'),
            ]);

            throw new ApiVideoRequestException(
                "api.video {$action} failed with status {$status}",
                httpStatus: $status,
                retryAfterSeconds: is_numeric($retryAfter) ? (int) $retryAfter : null,
                action: $action,
                previous: $e,
            );
        } catch (ConnectionException $e) {
            Log::error('apivideo.request_failed', ['action' => $action, 'error' => $e->getMessage()]);

            throw new ApiVideoRequestException(
                "api.video {$action} failed: {$e->getMessage()}",
                httpStatus: null,
                retryAfterSeconds: null,
                action: $action,
                previous: $e,
            );
        }
    }
}
