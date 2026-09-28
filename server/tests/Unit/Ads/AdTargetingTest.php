<?php

namespace Tests\Unit\Ads;

use App\Services\Ads\AdCandidate;
use App\Services\Ads\AdContext;
use App\Services\Ads\AdTargeting;
use PHPUnit\Framework\TestCase;

class AdTargetingTest extends TestCase
{
    private function candidate(array $targeting = [], array $placements = ['in_feed']): AdCandidate
    {
        return new AdCandidate(1, 1, 1, 100, 'cpm', $targeting, $placements);
    }

    public function test_no_targeting_matches_everyone(): void
    {
        $this->assertTrue(AdTargeting::matches($this->candidate(), new AdContext('in_feed', country: 'US', age: 40, gender: 'male')));
    }

    public function test_placement_must_match(): void
    {
        $this->assertFalse(AdTargeting::matches($this->candidate([], ['profile_top']), new AdContext('in_feed')));
    }

    public function test_country_targeting(): void
    {
        $c = $this->candidate(['countries' => ['US', 'NP']]);
        $this->assertTrue(AdTargeting::matches($c, new AdContext('in_feed', country: 'np')));   // case-insensitive
        $this->assertFalse(AdTargeting::matches($c, new AdContext('in_feed', country: 'IN')));  // wrong country
        $this->assertFalse(AdTargeting::matches($c, new AdContext('in_feed')));                 // unknown country
    }

    public function test_gender_targeting(): void
    {
        $c = $this->candidate(['genders' => ['female']]);
        $this->assertTrue(AdTargeting::matches($c, new AdContext('in_feed', gender: 'female')));
        $this->assertFalse(AdTargeting::matches($c, new AdContext('in_feed', gender: 'male')));
        $this->assertTrue(AdTargeting::matches($this->candidate(['genders' => ['all']]), new AdContext('in_feed', gender: 'male')));
    }

    public function test_age_band(): void
    {
        $c = $this->candidate(['age_min' => 18, 'age_max' => 24]);
        $this->assertTrue(AdTargeting::matches($c, new AdContext('in_feed', age: 20)));
        $this->assertFalse(AdTargeting::matches($c, new AdContext('in_feed', age: 30)));
        $this->assertFalse(AdTargeting::matches($c, new AdContext('in_feed', age: 13)));
        $this->assertTrue(AdTargeting::matches($c, new AdContext('in_feed'))); // unknown age passes
    }

    public function test_language_targeting(): void
    {
        $c = $this->candidate(['languages' => ['en', 'ne']]);
        $this->assertTrue(AdTargeting::matches($c, new AdContext('in_feed', language: 'EN')));
        $this->assertFalse(AdTargeting::matches($c, new AdContext('in_feed', language: 'fr')));
    }

    public function test_geo_radius_targeting(): void
    {
        // Kathmandu pin, 10km radius.
        $c = $this->candidate(['geo' => ['lat' => 27.7172, 'lng' => 85.3240, 'radius_km' => 10]]);

        // Viewer ~2km away → inside.
        $this->assertTrue(AdTargeting::matches($c, new AdContext('in_feed', lat: 27.7000, lng: 85.3300)));
        // Viewer ~600km away (Delhi) → outside.
        $this->assertFalse(AdTargeting::matches($c, new AdContext('in_feed', lat: 28.6139, lng: 77.2090)));
        // Viewer location unknown → not eligible for a geo-targeted ad.
        $this->assertFalse(AdTargeting::matches($c, new AdContext('in_feed')));
    }
}
