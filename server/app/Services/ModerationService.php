<?php

namespace App\Services;

use App\Models\MediaModeration;
use App\Models\ModerationLog;
use App\Models\ModerationSettings;
use App\Models\Video;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class ModerationService
{
    public function __construct(
        private readonly MediaPresignService $presign,
    ) {}

    // ── Entry points called by jobs ───────────────────────────────────

    public function scanVideo(Video $video): void
    {
        $record = $this->findOrCreateRecord($video, 'video_post');
        $this->updateScanStatus($record, 'scanning');

        try {
            $payload = $this->buildPayload($video->video_url, 'video', [
                'content_id'    => $video->id,
                'content_type'  => 'video_post',
                'duration'      => $video->duration,
                'is_suspicious' => (bool) $video->is_flagged,
                'full_scan'     => false,
            ]);

            $response = $this->callScanner('/scan/video', $payload);
            $this->processResult($record, $video, $response);

        } catch (\Throwable $e) {
            Log::error("ModerationService: video scan failed video_id={$video->id}: " . $e->getMessage());
            $this->failSafe($record, $video);
        }
    }

    public function scanImage(Video $video): void
    {
        $record = $this->findOrCreateRecord($video, 'image_post');
        $this->updateScanStatus($record, 'scanning');

        try {
            $payload = $this->buildPayload($video->video_url, 'image', [
                'content_id'   => $video->id,
                'content_type' => 'image_post',
            ]);

            $response = $this->callScanner('/scan/image', $payload);
            $this->processResult($record, $video, $response);

        } catch (\Throwable $e) {
            Log::error("ModerationService: image scan failed video_id={$video->id}: " . $e->getMessage());
            $this->failSafe($record, $video);
        }
    }

    public function rescan(Video $video): void
    {
        $mime    = $video->mime_type ?? '';
        $isImage = in_array($mime, config('moderation.image_mimes', []));
        $isImage ? $this->scanImage($video) : $this->scanVideo($video);
    }

    // ── Admin decision ────────────────────────────────────────────────

    public function adminDecide(
        Video           $video,
        MediaModeration $record,
        string          $decision,
        int             $adminId,
        ?string         $reason = null
    ): void {
        $oldDecision = $record->decision;

        $record->update([
            'admin_review_status' => $decision === 'rejected' ? 'rejected' : 'approved',
            'admin_reviewed_by'   => $adminId,
            'admin_reviewed_at'   => now(),
        ]);

        // Map admin decision to video moderation_status
        $moderationStatus = match ($decision) {
            'approved'  => 'approved',
            'rejected'  => 'rejected',
            'removed'   => 'rejected',
            default     => 'pending_review',
        };
        $video->update(['moderation_status' => $moderationStatus]);

        if ($decision === 'removed') {
            $video->update(['status' => 'removed']);
        }

        ModerationLog::create([
            'content_id'   => $video->id,
            'user_id'      => $video->user_id,
            'action_type'  => "admin_{$decision}",
            'old_decision' => $oldDecision,
            'new_decision' => $decision,
            'admin_id'     => $adminId,
            'reason'       => $reason,
        ]);
    }

    // ── Scanner result processing ─────────────────────────────────────

    private function processResult(MediaModeration $record, Video $video, array $result): void
    {
        $settings = ModerationSettings::current();
        $decision = $this->applyThresholds($result, $settings);

        $record->update([
            'scan_status'            => 'completed',
            'nudity_detected'        => $result['nudity_detected'] ?? false,
            'nudity_score'           => $result['nudity_score']    ?? 0,
            'nsfw_score'             => $result['nsfw_score']      ?? 0,
            'detected_labels_json'   => $result['detected_labels'] ?? [],
            'scanned_frames_count'   => $result['scanned_frames_count'] ?? 0,
            'highest_risk_timestamp' => $result['highest_risk_timestamp'] ?? null,
            'decision'               => $decision,
            'reason'                 => $result['reason'] ?? null,
            'model_name'             => $result['model_name'] ?? null,
            'model_version'          => $result['model_version'] ?? null,
            'scanned_at'             => now(),
        ]);

        $video->update(['moderation_status' => $decision]);

        if ($decision === 'pending_review') {
            $video->update(['is_flagged' => true]);
        }

        ModerationLog::create([
            'content_id'   => $video->id,
            'user_id'      => $video->user_id,
            'action_type'  => 'scan_completed',
            'old_decision' => 'pending',
            'new_decision' => $decision,
            'metadata'     => [
                'nudity_score' => $result['nudity_score'] ?? 0,
                'nsfw_score'   => $result['nsfw_score']   ?? 0,
            ],
        ]);
    }

    private function applyThresholds(array $result, ModerationSettings $s): string
    {
        $nudity = (float) ($result['nudity_score'] ?? 0);
        $nsfw   = (float) ($result['nsfw_score']   ?? 0);

        if ($nudity >= $s->nudity_reject_threshold || $nsfw >= $s->nsfw_reject_threshold) {
            return $s->auto_reject_enabled ? 'rejected' : 'pending_review';
        }

        if ($nudity >= $s->nudity_pending_threshold || $nsfw >= $s->nsfw_pending_threshold) {
            return 'pending_review';
        }

        return 'approved';
    }

    private function failSafe(MediaModeration $record, Video $video): void
    {
        $record->update([
            'scan_status' => 'failed',
            'decision'    => 'pending_review',
            'reason'      => 'Scanner unavailable - queued for manual review',
        ]);
        $video->update([
            'moderation_status' => 'pending_review',
            'is_flagged'        => true,
        ]);
    }

    // ── HTTP call to Python scanner ───────────────────────────────────

    private function callScanner(string $endpoint, array $payload): array
    {
        $baseUrl = rtrim(config('moderation.scanner_url'), '/');
        $timeout = (int) config('moderation.scanner_timeout', 300);
        $key     = config('moderation.scanner_key', '');

        $req = Http::timeout($timeout);
        if ($key) {
            $req = $req->withHeaders(['X-Scanner-Key' => $key]);
        }

        $resp = $req->post($baseUrl . $endpoint, $payload);

        if ($resp->failed()) {
            throw new \RuntimeException(
                "Scanner returned HTTP {$resp->status()}: " . $resp->body()
            );
        }

        return $resp->json();
    }

    // ── Payload builder ───────────────────────────────────────────────

    private function buildPayload(string $fileKey, string $type, array $extra): array
    {
        // Presign for ANY S3-compatible disk rather than a provider named 'r2'.
        // This used to compare the disk NAME, so after the move to B2 it fell
        // through to the local branch below and handed the scanner
        // Storage::path() of a remote object - a path that does not exist on
        // disk. Same leftover as the two guards in VideoController.
        $disk   = (string) config('filesystems.default', 'b2');
        $driver = config("filesystems.disks.{$disk}.driver");

        if (in_array($driver, ['s3', 's3-signed'], true)) {
            $ttl = (int) config('moderation.presign_ttl_minutes', 60);
            $downloadUrl = $this->presign->createReadUrl($fileKey, $ttl);
            $payload = array_merge($extra, ['download_url' => $downloadUrl]);
        } else {
            // Local/public disk - pass absolute path
            $localPath = Storage::path($fileKey);
            $payload   = array_merge($extra, ['file_path' => $localPath]);
        }

        return $payload;
    }

    // ── Record helpers ────────────────────────────────────────────────

    private function findOrCreateRecord(Video $video, string $contentType): MediaModeration
    {
        return MediaModeration::firstOrCreate(
            ['content_id' => $video->id, 'content_type' => $contentType],
            [
                'user_id'     => $video->user_id,
                'file_key'    => $video->video_url,
                'scan_status' => 'queued',
            ]
        );
    }

    private function updateScanStatus(MediaModeration $record, string $status): void
    {
        $record->update(['scan_status' => $status]);
    }
}
