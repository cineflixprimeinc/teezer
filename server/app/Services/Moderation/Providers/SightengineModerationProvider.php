<?php

namespace App\Services\Moderation\Providers;

use App\Services\Moderation\Contracts\ModerationProvider;
use App\Services\Moderation\ModerationVerdict;
use App\Services\SightengineService;
use Throwable;

/**
 * Sightengine, behind the moderation provider contract.
 *
 * A thin ADAPTER over the existing SightengineService, not a reimplementation.
 * That service already resolves its credentials, models and thresholds from
 * AppSetting with a config fallback, and is used by AdminModerationController;
 * duplicating any of that here would create a second source of truth for the
 * same keys - exactly what AppServiceProvider's docblock warns against for
 * PayPal, Stripe and Sightengine.
 *
 * What this class adds is the shape the chain needs: availability that can be
 * checked without calling the API, scores normalised to 0.0-1.0, and failure
 * expressed as an unavailable verdict rather than an exception.
 */
class SightengineModerationProvider implements ModerationProvider
{
    public function __construct(private readonly SightengineService $sightengine) {}

    public function key(): string
    {
        return 'sightengine';
    }

    public function label(): string
    {
        return 'Sightengine';
    }

    /**
     * Enabled by an admin AND holding credentials. Both come from the existing
     * service, so the panel's toggle is what actually gates this - the chain
     * skips a disabled provider without ever opening a connection.
     */
    public function isAvailable(): bool
    {
        try {
            return $this->sightengine->isEnabled() && $this->sightengine->isReady();
        } catch (Throwable) {
            return false;
        }
    }

    public function supports(string $mediaType): bool
    {
        // The service exposes checkVideo() too; video goes through the queued
        // ScanVideoJob path rather than this synchronous call, so only images
        // are claimed here. Claiming video would have the chain hand it work it
        // cannot do inline.
        return $mediaType === 'image';
    }

    public function isBillable(): bool
    {
        return true;
    }

    public function classifyImage(string $imageUrl): ModerationVerdict
    {
        $startedAt = microtime(true);

        try {
            $result = $this->sightengine->checkImage($imageUrl);
        } catch (Throwable $e) {
            // Never propagates. A provider outage must let the chain move on,
            // not unwind a queued job. The message is kept short and carries no
            // credential - SightengineService builds its request with the key in
            // the query string, so an exception message can contain it.
            return ModerationVerdict::unavailable(
                $this->key(),
                'Request failed: ' . class_basename($e),
                $this->elapsed($startedAt),
            );
        }

        // Reaching here means success: checkImage() THROWS on an HTTP failure
        // or a non-success status rather than returning a flag, so the catch
        // above is the only failure path. (An earlier version of this adapter
        // tested a `$result['ok']` key that the service has never returned,
        // which would have marked every successful scan unavailable and quietly
        // disabled the provider.)
        return ModerationVerdict::scored(
            $this->key(),
            $this->extractScores($result),
            $this->elapsed($startedAt),
        );
    }

    /**
     * Turn the service's result into per-category scores.
     *
     * normalizeImageResult() returns ['score', 'raw', 'type'], where `score` is
     * a single nudity-derived peak and `raw` is Sightengine's full response. The
     * peak alone is enough to make a decision but loses the category that caused
     * it, so the raw payload is mined for the rest.
     *
     * Defensive by necessity: which models run is admin-configurable
     * (sightengine_models), so the response shape varies with the settings.
     * Sightengine reports some classes as a bare float and others as
     * {"prob": 0.9}; both are read, anything else is ignored rather than
     * coerced into a misleading number.
     *
     * @return array<string, float>
     */
    private function extractScores(array $result): array
    {
        $scores = [];

        if (isset($result['score']) && is_numeric($result['score'])) {
            $scores['nudity'] = (float) $result['score'];
        }

        $raw = $result['raw'] ?? [];

        if (! is_array($raw)) {
            return $scores;
        }

        // Nudity is reported as a map of sub-classes; the peak of the explicit
        // ones is what matters, and it is what `score` already is - recomputed
        // here only when `score` was absent.
        if (! isset($scores['nudity']) && isset($raw['nudity']) && is_array($raw['nudity'])) {
            $explicit = array_filter(
                $raw['nudity'],
                fn ($v, $k) => is_numeric($v) && $k !== 'none',
                ARRAY_FILTER_USE_BOTH,
            );
            if ($explicit !== []) {
                $scores['nudity'] = (float) max($explicit);
            }
        }

        foreach (['weapon', 'alcohol', 'drugs', 'offensive', 'gore', 'violence', 'self-harm', 'tobacco'] as $class) {
            $value = $raw[$class] ?? null;

            if (is_numeric($value)) {
                $scores[str_replace('-', '_', $class)] = (float) $value;
            } elseif (is_array($value) && isset($value['prob']) && is_numeric($value['prob'])) {
                $scores[str_replace('-', '_', $class)] = (float) $value['prob'];
            }
        }

        return $scores;
    }

    private function elapsed(float $startedAt): int
    {
        return (int) round((microtime(true) - $startedAt) * 1000);
    }
}
