<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Subscriptions gets its own dedicated intro screen now (SubscriptionsScreen,
 * same reasoning/template as Gifts & Coins/Creator Rewards - see
 * StudioMonetizationSection.tsx's onPress), replacing the shared
 * StudioProgrammeScreen template it used before. Seeds the SAME copy already
 * hardcoded as that screen's fallback - same reasoning as the
 * 2026_08_20_000004/000005 migrations for the other two.
 *
 * Overwrites the hero_description this key already had (from
 * 2026_08_20_000004, written for the old shared-template blurb) with the new
 * dedicated screen's own default text, so the DB and the screen's fallback
 * say the same thing rather than two different-but-similar sentences.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('monetization_programs')->where('key', 'subscriptions')->update([
            'hero_title'       => "Turn Fans Into\nPaying Subscribers",
            'hero_description' => 'Offer exclusive perks fans can subscribe to monthly - private posts, badges and more, paid straight to your Creator Wallet.',
            'features'         => json_encode([
                ['icon' => 'Crown', 'title' => 'Set Your Own Tiers', 'desc' => 'Choose what subscribers get and how much they pay each month.'],
                ['icon' => 'Star', 'title' => 'Subscriber Perks', 'desc' => 'Badges, subscriber-only posts and more to reward your supporters.'],
                ['icon' => 'ShieldCheck', 'title' => 'Paid Automatically', 'desc' => 'Subscriptions bill monthly and pay straight to your Creator Wallet.'],
            ]),
        ]);
    }

    public function down(): void
    {
        DB::table('monetization_programs')->where('key', 'subscriptions')->update([
            'hero_title'       => null,
            'hero_description' => 'Fans pay monthly for perks you choose - subscriber posts, badges and private Spaces.',
            'features'         => null,
        ]);
    }
};
