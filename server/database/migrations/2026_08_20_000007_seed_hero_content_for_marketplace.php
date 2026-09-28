<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Brand Marketplace gets its own dedicated intro screen now
 * (BrandMarketplaceScreen, same template as Gifts & Coins/Creator Rewards/
 * Subscriptions - see StudioMonetizationSection.tsx's onPress), replacing
 * the shared StudioProgrammeScreen template it used before - the last of
 * the five programmes to get one. Seeds the SAME copy already hardcoded as
 * that screen's fallback, same reasoning as the 2026_08_20_000004/000005/
 * 000006 migrations for the other three.
 *
 * Unlike those three, this programme has no matching reference illustration
 * yet - BrandMarketplaceScreen's own MarketplaceIllustration is a hand-coded
 * stand-in (see that file's docblock), not a reconstructed asset.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('monetization_programs')->where('key', 'marketplace')->update([
            'hero_title'       => "Turn Your Reach Into\nBrand Partnerships",
            'hero_description' => 'Brands browse creators by audience and topic, then send paid briefs you choose to accept - every deal and rate is yours to set.',
            'features'         => json_encode([
                ['icon' => 'Handshake', 'title' => 'Get Matched With Brands', 'desc' => 'Brands find you by audience, topic and engagement - no pitching required.'],
                ['icon' => 'Megaphone', 'title' => 'Run Paid Campaigns', 'desc' => 'Accept briefs that fit your content and set your own rate.'],
                ['icon' => 'TrendingUp', 'title' => 'Grow While You Earn', 'desc' => 'Every campaign adds real reach on top of real payouts.'],
            ]),
        ]);
    }

    public function down(): void
    {
        DB::table('monetization_programs')->where('key', 'marketplace')->update([
            'hero_title'       => null,
            'hero_description' => 'Brands browse creators by topic and audience, then send paid briefs you choose to accept.',
            'features'         => null,
        ]);
    }
};
