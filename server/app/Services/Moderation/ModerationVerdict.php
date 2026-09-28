<?php

namespace App\Services\Moderation;

/**
 * What one provider concluded about one piece of media.
 *
 * Immutable, and deliberately carries no decision. A verdict says "0.93 nudity,
 * 0.02 violence, and I was able to answer"; whether that means reject, review
 * or allow is policy, and policy lives in one place rather than being
 * re-implemented per provider.
 *
 * The distinction that matters most here is UNAVAILABLE versus a clean scan.
 * Both have no categories over threshold, and conflating them is how unsafe
 * content gets approved during an outage: a provider that could not answer
 * must never look like a provider that answered "safe".
 */
final class ModerationVerdict
{
    private function __construct(
        public readonly string $provider,
        public readonly bool $available,
        /** @var array<string, float> category => score, 0.0-1.0 */
        public readonly array $scores,
        public readonly ?string $error,
        public readonly int $elapsedMs,
        public readonly array $raw,
    ) {}

    /** @param array<string, float> $scores */
    public static function scored(string $provider, array $scores, int $elapsedMs = 0, array $raw = []): self
    {
        // Clamped because a provider returning 1.4 or -0.1 would silently
        // corrupt every threshold comparison downstream.
        $clamped = [];
        foreach ($scores as $category => $score) {
            $clamped[$category] = max(0.0, min(1.0, (float) $score));
        }

        return new self($provider, true, $clamped, null, $elapsedMs, $raw);
    }

    /**
     * The provider could not answer - no credentials, disabled, rate limited,
     * timed out, service down. NOT the same as "nothing detected".
     */
    public static function unavailable(string $provider, string $error, int $elapsedMs = 0): self
    {
        return new self($provider, false, [], $error, $elapsedMs, []);
    }

    public function scoreFor(string $category): float
    {
        return $this->scores[$category] ?? 0.0;
    }

    /** The single highest score across every category, for a quick risk read. */
    public function peak(): float
    {
        return $this->scores === [] ? 0.0 : max($this->scores);
    }

    /** @return array<string, float> categories at or above $threshold, highest first */
    public function above(float $threshold): array
    {
        $hits = array_filter($this->scores, fn (float $s) => $s >= $threshold);
        arsort($hits);

        return $hits;
    }

    /** Safe to persist: scores and timing, never credentials or raw payloads. */
    public function toLog(): array
    {
        return [
            'provider'   => $this->provider,
            'available'  => $this->available,
            'scores'     => $this->scores,
            'peak'       => round($this->peak(), 4),
            'error'      => $this->error,
            'elapsed_ms' => $this->elapsedMs,
        ];
    }
}
