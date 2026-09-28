<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Seeds `hero_title` with the SAME two-line headings already hardcoded as
 * each dedicated intro screen's fallback (GiftsIntroScreen,
 * SellerApplicationScreen, CreatorRewardsScreen) - same reasoning as the
 * 2026_08_20_000004 migration for hero_description/features.
 *
 * Safe to seed now (unlike when hero_description/features were seeded):
 * GiftsIntroScreen and CreatorRewardsScreen were updated to keep the
 * two-line, two-colour treatment for an admin-set title too - the accent
 * colour applies to whatever comes after the LAST line break, so a title
 * seeded with an embedded "\n" (Laravel escapes this as a literal newline
 * character in the string, not the two characters "\", "n") renders
 * identically to the hardcoded default it replaces.
 */
return new class extends Migration
{
    public function up(): void
    {
        $rows = [
            'gifts'     => "Earn Real Rewards\nFrom Gifts & Coins",
            'affiliate' => "Turn Your Profile Into\nYour Own Shop",
            'rewards'   => "Get Paid For\nEvery View",
        ];

        foreach ($rows as $key => $title) {
            DB::table('monetization_programs')->where('key', $key)->update(['hero_title' => $title]);
        }
    }

    public function down(): void
    {
        DB::table('monetization_programs')->update(['hero_title' => null]);
    }
};
