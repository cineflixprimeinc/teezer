<?php

namespace App\Services\Moderation\Contracts;

use App\Services\Moderation\ModerationVerdict;

/**
 * One content-safety provider.
 *
 * Teezer already has a working moderation pipeline - ModerationService ->
 * ScanImageJob / ScanVideoJob -> the self-hosted Python scanner - and this does
 * NOT replace it. The scanner is simply the first implementation behind this
 * interface, joined by Sightengine, Rekognition and Vision, so the pipeline can
 * fall back between providers instead of being hardcoded to one.
 *
 * The contract is deliberately narrow. A provider answers one question about
 * one piece of media and reports whether it could answer at all; deciding what
 * to DO with the answer is the chain's and the rule engine's business, not the
 * provider's. That separation is what lets a provider be swapped without
 * touching policy.
 *
 * Implementations MUST NOT throw for an expected failure - a missing key, a
 * 429, a provider outage. Those are `unavailable()` verdicts, because the chain
 * needs to try the next provider rather than unwind a queued job.
 */
interface ModerationProvider
{
    /** Stable identifier, matching the integrations registry key. */
    public function key(): string;

    /** Human name for the admin UI and audit entries. */
    public function label(): string;

    /**
     * Whether this provider can be called right now: enabled by an admin AND
     * holding the credentials it needs. Checked before every call so a
     * provider disabled in the panel is genuinely skipped rather than called
     * and failed.
     */
    public function isAvailable(): bool;

    /** Whether it can classify this media type at all. */
    public function supports(string $mediaType): bool;

    /**
     * Classify an image by URL.
     *
     * A URL rather than a local path, because that is what the existing
     * pipeline already speaks: SightengineService::checkImage() takes one, and
     * the Python scanner takes a download_url. Defining the contract around
     * paths would have meant rewriting working code to suit a new interface,
     * instead of the interface fitting the system it is joining.
     */
    public function classifyImage(string $imageUrl): ModerationVerdict;

    /**
     * Whether calling this provider costs money.
     *
     * Surfaced in the admin UI and honoured by the chain, which will not run a
     * billable provider as a redundant second opinion when a free one has
     * already answered.
     */
    public function isBillable(): bool;
}
