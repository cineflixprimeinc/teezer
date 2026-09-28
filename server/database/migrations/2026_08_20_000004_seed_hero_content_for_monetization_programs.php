<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Seeds `hero_description`/`features` with the SAME copy already hardcoded
 * as each client's fallback (GiftsIntroScreen, SellerApplicationScreen,
 * CreatorRewardsScreen, StudioProgrammeScreen's blurb) - not new content.
 *
 * Nothing user-visible changes the moment this runs: the DB row now says
 * what the app was already showing. What changes is that it's now visible
 * and editable from Admin Panel -> Monetization Control Center -> [programme]
 * -> Overview, instead of living only in each screen's source.
 *
 * `hero_title` is deliberately left untouched (still null): the 3 dedicated
 * intro screens' two-line, two-colour headings only render that way while
 * hero_title is unset (see GiftsIntroScreen/CreatorRewardsScreen's own
 * fallback branch) - seeding it would silently flatten every heading to
 * plain single-colour text. Descriptions and bullets have no such trade-off.
 *
 * `features` (the bullet rows) only exist for the three dedicated pitch
 * screens - Subscriptions/Brand Marketplace use the shared
 * StudioProgrammeScreen template, which has no bullets section to seed.
 */
return new class extends Migration
{
    public function up(): void
    {
        $rows = [
            'gifts' => [
                'hero_description' => "Fans send Coins as gifts on your videos and LIVE streams - credited to your wallet the instant they're sent.",
                'features' => [
                    ['icon' => 'Gift', 'title' => 'Receive Gifts', 'desc' => 'Fans send Coins as gifts on your videos and LIVE streams.'],
                    ['icon' => 'Wallet', 'title' => 'Creator Wallet', 'desc' => "Every gift lands in your wallet in full, the moment it's sent."],
                    ['icon' => 'Star', 'title' => 'Top Supporter Perks', 'desc' => 'Your biggest supporters can earn badges and stand out in comments.'],
                ],
            ],
            'affiliate' => [
                'hero_description' => 'A marketplace built into the app - list your own products and sell directly to your audience.',
                'features' => [
                    ['icon' => 'Package', 'title' => 'List your own products', 'desc' => 'Add items from your own inventory and manage them from your Shop.'],
                    ['icon' => 'Store', 'title' => 'Sell directly to your audience', 'desc' => 'Showcase products in your videos, LIVE streams and on your profile.'],
                    ['icon' => 'BarChart3', 'title' => 'Track orders and earnings', 'desc' => 'See orders, revenue and how your Shop is performing, all in one place.'],
                ],
            ],
            'rewards' => [
                'hero_description' => 'Earn a set rate for every 1,000 qualified views on your videos - real content, watched by real people.',
                'features' => [
                    ['icon' => 'BarChart3', 'title' => 'Per-1,000-View Payouts', 'desc' => 'Earn a set rate for every 1,000 qualified views your videos get.'],
                    ['icon' => 'Wallet', 'title' => 'Paid to Your Wallet', 'desc' => 'Rewards are added straight to your Creator Wallet, ready to withdraw.'],
                    ['icon' => 'Trophy', 'title' => 'Recognized for Quality', 'desc' => 'Only original videos and real viewers count - no shortcuts, no bots.'],
                ],
            ],
            'subscriptions' => [
                'hero_description' => 'Fans pay monthly for perks you choose - subscriber posts, badges and private Spaces.',
                'features' => null,
            ],
            'marketplace' => [
                'hero_description' => 'Brands browse creators by topic and audience, then send paid briefs you choose to accept.',
                'features' => null,
            ],
        ];

        foreach ($rows as $key => $data) {
            DB::table('monetization_programs')->where('key', $key)->update([
                'hero_description' => $data['hero_description'],
                'features'         => $data['features'] !== null ? json_encode($data['features']) : null,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('monetization_programs')->update([
            'hero_description' => null,
            'features'         => null,
        ]);
    }
};
