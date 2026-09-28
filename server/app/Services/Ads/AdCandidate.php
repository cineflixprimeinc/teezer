<?php

namespace App\Services\Ads;

/**
 * A single eligible ad (creative) in the auction pool. Serialisable to/from the
 * Redis pool. Pure value object — no DB access.
 */
class AdCandidate
{
    public function __construct(
        public readonly int $campaignId,
        public readonly int $adGroupId,
        public readonly int $creativeId,
        public readonly int $bidCents,
        public readonly string $bidType,   // cpm | cpc | cpv
        public readonly array $targeting,  // countries, age_min, age_max, genders, languages, interests
        public readonly array $placements, // ["in_feed", ...]
        public readonly ?int $videoId = null,
        public readonly array $stats = [], // impressions, clicks (recent) — drives pCTR
        public readonly array $meta = [],  // headline, body, cta_type, destination_url, media, ... (for rendering)
    ) {}

    public static function fromArray(array $a): self
    {
        return new self(
            campaignId: (int) ($a['campaignId'] ?? 0),
            adGroupId:  (int) ($a['adGroupId'] ?? 0),
            creativeId: (int) ($a['creativeId'] ?? 0),
            bidCents:   (int) ($a['bidCents'] ?? 0),
            bidType:    (string) ($a['bidType'] ?? 'cpm'),
            targeting:  (array) ($a['targeting'] ?? []),
            placements: (array) ($a['placements'] ?? []),
            videoId:    isset($a['videoId']) ? (int) $a['videoId'] : null,
            stats:      (array) ($a['stats'] ?? []),
            meta:       (array) ($a['meta'] ?? []),
        );
    }

    public function toArray(): array
    {
        return [
            'campaignId' => $this->campaignId,
            'adGroupId'  => $this->adGroupId,
            'creativeId' => $this->creativeId,
            'bidCents'   => $this->bidCents,
            'bidType'    => $this->bidType,
            'targeting'  => $this->targeting,
            'placements' => $this->placements,
            'videoId'    => $this->videoId,
            'stats'      => $this->stats,
            'meta'       => $this->meta,
        ];
    }
}
