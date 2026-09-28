<?php

namespace App\Services;

use App\Models\AppSetting;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SightengineService
{
    /* ── Config helpers - DB settings override .env ─────────────────────── */

    public function isEnabled(): bool
    {
        $db = AppSetting::get('sightengine_enabled');
        if ($db !== null) return (bool) $db;
        return (bool) config('moderation.sightengine_enabled', false);
    }

    private function apiUser(): string
    {
        return (string) (AppSetting::get('sightengine_api_user')
            ?? config('moderation.sightengine_api_user', ''));
    }

    private function apiSecret(): string
    {
        return (string) (AppSetting::get('sightengine_api_secret')
            ?? config('moderation.sightengine_api_secret', ''));
    }

    private function models(): string
    {
        return (string) (AppSetting::get('sightengine_models')
            ?? config('moderation.sightengine_models', 'nudity-2.1'));
    }

    private function blockThreshold(): float
    {
        return (float) (AppSetting::get('sightengine_block_threshold')
            ?? config('moderation.sightengine_block_threshold', 0.80));
    }

    private function reviewThreshold(): float
    {
        return (float) (AppSetting::get('sightengine_review_threshold')
            ?? config('moderation.sightengine_review_threshold', 0.50));
    }

    /* ── Public API ──────────────────────────────────────────────────────── */

    /**
     * Check if service is configured and enabled.
     */
    public function isReady(): bool
    {
        return $this->isEnabled() && $this->apiUser() !== '' && $this->apiSecret() !== '';
    }

    /**
     * Moderate a single image via its URL.
     * Returns ['score' => float, 'raw' => array, 'type' => 'image']
     */
    public function checkImage(string $imageUrl): array
    {
        $response = Http::timeout(60)->get('https://api.sightengine.com/1.0/check.json', [
            'url'        => $imageUrl,
            'models'     => $this->models(),
            'api_user'   => $this->apiUser(),
            'api_secret' => $this->apiSecret(),
        ]);

        if (! $response->successful()) {
            throw new \RuntimeException('Sightengine image check HTTP ' . $response->status());
        }

        return $this->normalizeImageResult($response->json());
    }

    /**
     * Moderate a video via its URL.
     * Sightengine samples frames automatically; this call is synchronous for
     * videos up to ~5–10 minutes (timeout 300 s).
     * Returns ['score' => float, 'raw' => array, 'type' => 'video']
     */
    public function checkVideo(string $videoUrl): array
    {
        $response = Http::timeout(300)->asForm()->post(
            'https://api.sightengine.com/1.0/video/check.json',
            [
                'stream_url' => $videoUrl,
                'models'     => $this->models(),
                'api_user'   => $this->apiUser(),
                'api_secret' => $this->apiSecret(),
            ]
        );

        if (! $response->successful()) {
            throw new \RuntimeException('Sightengine video check HTTP ' . $response->status());
        }

        return $this->normalizeVideoResult($response->json());
    }

    /**
     * Test API credentials with a known-safe public image.
     * Returns ['ok' => bool, 'message' => string]
     */
    public function testConnection(): array
    {
        try {
            $result = $this->checkImage('https://sightengine.com/assets/img/examples/example7.jpg');
            return ['ok' => true, 'message' => 'Connection successful. API credentials are valid.', 'score' => $result['score']];
        } catch (\Throwable $e) {
            return ['ok' => false, 'message' => $e->getMessage()];
        }
    }

    /**
     * Turn a raw score into a moderation decision.
     * Returns ['status' => passed|review|failed, 'blocked' => bool, 'reason' => string|null]
     */
    public function evaluate(float $score): array
    {
        if ($score >= $this->blockThreshold()) {
            return [
                'status'  => 'failed',
                'blocked' => true,
                'reason'  => 'This upload violates Teezer content policy.',
            ];
        }
        if ($score >= $this->reviewThreshold()) {
            return [
                'status'  => 'review',
                'blocked' => false,
                'reason'  => 'Content flagged for manual review.',
            ];
        }
        return ['status' => 'passed', 'blocked' => false, 'reason' => null];
    }

    /* ── Private normalizers ─────────────────────────────────────────────── */

    private function normalizeImageResult(array $json): array
    {
        if (($json['status'] ?? '') !== 'success') {
            $msg = $json['error']['message'] ?? ($json['message'] ?? 'Unknown Sightengine error');
            throw new \RuntimeException("Sightengine: {$msg}");
        }

        $nudity = $json['nudity'] ?? [];
        $score  = max(
            (float) ($nudity['sexual_activity'] ?? 0),
            (float) ($nudity['sexual_display']   ?? 0),
            (float) ($nudity['erotica']           ?? 0),
            (float) ($nudity['very_suggestive']   ?? 0),
        );

        return ['score' => $score, 'raw' => $json, 'type' => 'image'];
    }

    private function normalizeVideoResult(array $json): array
    {
        if (($json['status'] ?? '') !== 'success') {
            $msg = $json['error']['message'] ?? ($json['message'] ?? 'Unknown Sightengine error');
            throw new \RuntimeException("Sightengine: {$msg}");
        }

        $frames   = $json['data']['frames'] ?? [];
        $topScore = 0.0;

        foreach ($frames as $frame) {
            $nudity     = $frame['nudity'] ?? [];
            $frameScore = max(
                (float) ($nudity['sexual_activity'] ?? 0),
                (float) ($nudity['sexual_display']   ?? 0),
                (float) ($nudity['erotica']           ?? 0),
                (float) ($nudity['very_suggestive']   ?? 0),
            );
            $topScore = max($topScore, $frameScore);
        }

        return ['score' => $topScore, 'raw' => $json, 'type' => 'video'];
    }
}
