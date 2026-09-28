<?php

namespace App\Services\Ads;

/**
 * Pure targeting matcher: does this candidate's audience include this viewer?
 * Empty/absent targeting fields mean "no restriction" (broad). Unknown viewer
 * attributes (e.g. null age) pass attribute filters rather than block delivery.
 */
class AdTargeting
{
    public static function matches(AdCandidate $c, AdContext $ctx): bool
    {
        $t = $c->targeting;

        // Placement must be one this candidate runs on.
        if (! empty($c->placements) && ! in_array($ctx->placement, $c->placements, true)) {
            return false;
        }

        // Country
        if (! empty($t['countries'])) {
            if (! $ctx->country) {
                return false;
            }
            if (! in_array(strtoupper($ctx->country), array_map('strtoupper', (array) $t['countries']), true)) {
                return false;
            }
        }

        // Gender ("all" = no restriction)
        if (! empty($t['genders'])) {
            $genders = array_map('strtolower', (array) $t['genders']);
            if (! in_array('all', $genders, true)) {
                if (! $ctx->gender || ! in_array(strtolower($ctx->gender), $genders, true)) {
                    return false;
                }
            }
        }

        // Age band (only when the viewer's age is known)
        if ($ctx->age !== null) {
            if (($t['age_min'] ?? null) !== null && $ctx->age < (int) $t['age_min']) {
                return false;
            }
            if (($t['age_max'] ?? null) !== null && $ctx->age > (int) $t['age_max']) {
                return false;
            }
        }

        // Language
        if (! empty($t['languages'])) {
            if (! $ctx->language) {
                return false;
            }
            if (! in_array(strtolower($ctx->language), array_map('strtolower', (array) $t['languages']), true)) {
                return false;
            }
        }

        // Geo radius (map pin + radius). Requires the viewer's GPS; a geo-targeted
        // ad is simply not eligible for viewers whose location is unknown.
        if (! empty($t['geo']) && isset($t['geo']['lat'], $t['geo']['lng'])) {
            if ($ctx->lat === null || $ctx->lng === null) {
                return false;
            }
            $radiusKm = (float) ($t['geo']['radius_km'] ?? 10);
            if (self::haversineKm((float) $t['geo']['lat'], (float) $t['geo']['lng'], $ctx->lat, $ctx->lng) > $radiusKm) {
                return false;
            }
        }

        return true;
    }

    /** Great-circle distance in km. Lightweight — no PostGIS, no DB, no extension. */
    private static function haversineKm(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $earthKm = 6371.0088;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat / 2) ** 2
            + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        return $earthKm * 2 * asin(min(1.0, sqrt($a)));
    }
}
