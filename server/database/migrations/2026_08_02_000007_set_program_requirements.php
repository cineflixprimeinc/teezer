<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The canonical requirement and unlock set for the five programmes.
 *
 * These are admin-editable, so this migration writes the agreed baseline once.
 * It deliberately OVERWRITES whatever is stored: the point of running it is to
 * make the platform match the specification. Anything an operator has tuned
 * since should be re-applied in the console afterwards.
 *
 * Every requirement here uses a metric MonetizationEligibilityService can
 * actually measure - a requirement it cannot check would sit on a creator's
 * checklist forever with no way to clear it.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('monetization_programs')) {
            return;
        }

        foreach (self::spec() as $key => $row) {
            DB::table('monetization_programs')->where('key', $key)->update([
                'label'        => $row['label'],
                'description'  => $row['description'],
                'requirements' => json_encode($row['requirements']),
                'unlocks'      => json_encode($row['unlocks']),
                'updated_at'   => now(),
            ]);
        }

        Cache::forget('monetization_programs:all');
    }

    /** Irreversible by design - the previous requirement set is not recorded. */
    public function down(): void
    {
        //
    }

    private static function spec(): array
    {
        return [
            'gifts' => [
                'label'       => 'Gifts & Coins',
                'description' => 'Receive gifts from viewers on your videos and live streams.',
                'requirements' => [
                    ['key' => 'email',      'label' => 'Email or phone verified', 'target' => null],
                    ['key' => 'age',        'label' => 'Account age',             'target' => 7],
                    ['key' => 'videos',     'label' => 'Public videos',           'target' => 3],
                    ['key' => 'guidelines', 'label' => 'Community Guidelines',    'target' => null],
                ],
                'unlocks' => ['Creator Wallet', 'Video Gifts', 'Live Gifts'],
            ],

            'affiliate' => [
                'label'       => 'Affiliate Shop',
                'description' => 'Earn commissions by promoting products.',
                'requirements' => [
                    ['key' => 'followers',  'label' => 'Followers',            'target' => 500],
                    ['key' => 'age',        'label' => 'Account age',          'target' => 14],
                    ['key' => 'identity',   'label' => 'Identity verified',    'target' => null],
                    ['key' => 'videos',     'label' => 'Public videos',        'target' => 10],
                    ['key' => 'guidelines', 'label' => 'Community Guidelines', 'target' => null],
                ],
                'unlocks' => ['Affiliate Shop', 'Product Tagging', 'Commission Earnings'],
            ],

            'subscriptions' => [
                'label'       => 'Subscriptions',
                'description' => 'Offer exclusive content and subscriber benefits.',
                'requirements' => [
                    ['key' => 'followers',  'label' => 'Followers',            'target' => 5000],
                    ['key' => 'age',        'label' => 'Account age',          'target' => 30],
                    ['key' => 'videos',     'label' => 'Public videos',        'target' => 50],
                    ['key' => 'identity',   'label' => 'Identity verified',    'target' => null],
                    ['key' => 'guidelines', 'label' => 'Community Guidelines', 'target' => null],
                ],
                'unlocks' => [
                    'Subscriptions', 'Subscriber Badge',
                    'Subscriber-only Videos', 'Subscriber-only Live Streams',
                ],
            ],

            'marketplace' => [
                'label'       => 'Brand Marketplace',
                'description' => 'Collaborate with brands and participate in sponsorship campaigns.',
                'requirements' => [
                    ['key' => 'followers',   'label' => 'Followers',            'target' => 10000],
                    ['key' => 'age',         'label' => 'Account age',          'target' => 60],
                    ['key' => 'videos',      'label' => 'Public videos',        'target' => 100],
                    ['key' => 'views_total', 'label' => 'Total video views',    'target' => 250000],
                    ['key' => 'identity',    'label' => 'Identity verified',    'target' => null],
                    ['key' => 'guidelines',  'label' => 'Community Guidelines', 'target' => null],
                ],
                'unlocks' => ['Brand Marketplace', 'Campaign Invitations', 'Sponsorship Opportunities'],
            ],

            'rewards' => [
                'label'       => 'Creator Rewards',
                'description' => 'Earn money from qualified video views.',
                'requirements' => [
                    ['key' => 'followers',  'label' => 'Followers',                 'target' => 25000],
                    ['key' => 'age',        'label' => 'Account age',               'target' => 90],
                    ['key' => 'videos',     'label' => 'Public videos',             'target' => 200],
                    ['key' => 'views30',    'label' => 'Qualified views (30 days)', 'target' => 1000000],
                    ['key' => 'watch30',    'label' => 'Watch minutes (30 days)',   'target' => 250000],
                    ['key' => 'identity',   'label' => 'Identity verified',         'target' => null],
                    ['key' => 'guidelines', 'label' => 'Community Guidelines',      'target' => null],
                ],
                'unlocks' => [
                    'Creator Rewards', 'Revenue Dashboard', 'Earnings',
                    'Creator Wallet', 'Withdraw Earnings',
                ],
            ],
        ];
    }
};
