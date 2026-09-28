<?php

namespace App\Services\Video\Contracts;

/**
 * Everything Teezer needs from an external transcoding provider, kept
 * deliberately small. VideoProcessingService is the only caller; nothing
 * else in the app should type-hint a concrete provider. Swapping providers
 * later means writing one new class against this interface, not touching
 * the jobs, webhook controller, or anything upload/playback-related.
 */
interface TranscodingProvider
{
    /** Provider name as stored in video_processing_jobs.provider / videos.processing_provider. */
    public function name(): string;

    /**
     * Start encoding a source video already sitting in B2. $sourceUrl must be
     * a URL the provider can fetch on its own (a signed/public B2 GET URL) -
     * the video bytes never pass through this application.
     *
     * @return string the provider's own job/video id, to store as provider_job_id
     */
    public function createJob(string $sourceUrl, array $requestedOutputs): string;

    /** Current status as the provider reports it right now (used for reconciliation polling, not the primary path - webhooks are). */
    public function getStatus(string $providerJobId): array;

    /**
     * The provider-hosted URLs to pull encoded output back from - an HLS
     * master playlist URL and/or a single progressive MP4 URL, whatever the
     * provider actually offers. TransferEncodedOutputToB2 is the only caller.
     */
    public function getAssetUrls(string $providerJobId): array;

    /** Stop the provider from continuing to host/bill for this video's output. Best-effort - callers must not let a failure here block anything else. */
    public function deleteRemoteAsset(string $providerJobId): void;

    /**
     * Verify a webhook request genuinely came from this provider. $rawBody
     * must be the exact, unparsed request body - signature schemes are
     * byte-sensitive.
     */
    public function verifyWebhookSignature(string $rawBody, ?string $signatureHeader): bool;

    /**
     * Parse an already-signature-verified webhook body into a normalized
     * shape: ['type' => string, 'provider_job_id' => string, 'quality' => ?string, 'emitted_at' => ?string].
     * Returns null for an event type this integration doesn't act on.
     */
    public function parseWebhookEvent(array $payload): ?array;
}
