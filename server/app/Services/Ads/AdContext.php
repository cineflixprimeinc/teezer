<?php

namespace App\Services\Ads;

/**
 * Immutable request context for an ad decision: who is viewing, where, and what
 * has already been shown this session (for frequency capping). Pure value object.
 */
class AdContext
{
    /**
     * @param string[] $interests
     * @param int[]    $seenCampaignIds Campaigns already shown to this viewer in the current feed page/session.
     */
    public function __construct(
        public readonly string $placement,
        public readonly ?int $userId = null,
        public readonly ?string $sessionId = null,
        public readonly ?string $country = null,   // ISO-2
        public readonly ?string $language = null,
        public readonly ?int $age = null,
        public readonly ?string $gender = null,     // male | female
        public readonly array $interests = [],
        public readonly array $seenCampaignIds = [],
        public readonly ?float $lat = null,          // viewer GPS latitude (geo-radius targeting)
        public readonly ?float $lng = null,          // viewer GPS longitude
    ) {}
}
