<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Admin-controlled monetization programmes.
 *
 * Each row is one programme the app and the website render. The admin panel
 * owns three things about it:
 *
 *   - `mode`: enabled | coming_soon | disabled. `disabled` hides the programme
 *     from both clients entirely; `coming_soon` shows it but never lets it open,
 *     whatever the creator's numbers say.
 *   - `requirements`: the checklist a creator must meet. Stored as JSON rather
 *     than a second table because it is edited as a whole - the admin adds,
 *     removes and reorders rows in one form - and is never queried across
 *     programmes.
 *   - the copy: label, description and what the programme unlocks.
 *
 * Seeding the five programmes here rather than in a seeder is deliberate: the
 * clients read this table directly, so an empty table is an empty Monetization
 * tab. The rows must exist the moment the migration finishes.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('monetization_programs')) {
            return;
        }

        Schema::create('monetization_programs', function (Blueprint $table) {
            $table->id();
            // The clients look programmes up by this, never by id, so a renamed
            // label never breaks a client that has already shipped.
            $table->string('key', 40)->unique();
            $table->string('label');
            $table->text('description')->nullable();
            $table->string('mode', 20)->default('coming_soon');
            $table->json('requirements')->nullable();
            $table->json('unlocks')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        $now = now();
        DB::table('monetization_programs')->insert(array_map(
            fn (array $r) => $r + ['created_at' => $now, 'updated_at' => $now],
            self::defaults(),
        ));
    }

    public function down(): void
    {
        Schema::dropIfExists('monetization_programs');
    }

    /**
     * The starting five. `mode` reflects what the platform can ACTUALLY do
     * today: gifts pay out, nothing else does, so only gifts ships enabled.
     */
    private static function defaults(): array
    {
        return [
            [
                'key'         => 'gifts',
                'label'       => 'Gifts & Coins',
                'description' => 'Receive gifts from viewers on your videos and live streams.',
                'mode'        => 'enabled',
                'sort_order'  => 1,
                'requirements' => json_encode([
                    ['key' => 'email',      'label' => 'Email or phone verified', 'target' => null],
                    ['key' => 'age',        'label' => 'Account age',             'target' => 7],
                    ['key' => 'videos',     'label' => 'Public videos',           'target' => 3],
                    ['key' => 'guidelines', 'label' => 'No active violations',    'target' => null],
                ]),
                'unlocks' => json_encode(['Receive Gifts', 'Creator Wallet', 'Live Gifts']),
            ],
            [
                'key'         => 'rewards',
                'label'       => 'Creator Rewards',
                'description' => 'Earn money from qualified video views.',
                'mode'        => 'coming_soon',
                'sort_order'  => 2,
                'requirements' => json_encode([
                    ['key' => 'followers',  'label' => 'Followers',               'target' => 10000],
                    ['key' => 'views30',    'label' => 'Qualified views (30d)',   'target' => 500000],
                    ['key' => 'videos',     'label' => 'Public videos',           'target' => 100],
                    ['key' => 'watch30',    'label' => 'Watch minutes (30d)',     'target' => 100000],
                    ['key' => 'identity',   'label' => 'Identity verified',       'target' => null],
                    ['key' => 'guidelines', 'label' => 'No active violations',    'target' => null],
                ]),
                'unlocks' => json_encode([
                    'Creator Rewards', 'Revenue Dashboard', 'Earnings Analytics',
                    'Creator Wallet', 'Withdraw Earnings',
                ]),
            ],
            [
                'key'         => 'subscriptions',
                'label'       => 'Subscriptions',
                'description' => 'Offer exclusive content and subscriber benefits.',
                'mode'        => 'coming_soon',
                'sort_order'  => 3,
                'requirements' => json_encode([
                    ['key' => 'followers',  'label' => 'Followers',            'target' => 5000],
                    ['key' => 'videos',     'label' => 'Public videos',        'target' => 25],
                    ['key' => 'identity',   'label' => 'Identity verified',    'target' => null],
                    ['key' => 'guidelines', 'label' => 'No active violations', 'target' => null],
                ]),
                'unlocks' => json_encode([
                    'Subscriber-only Videos', 'Subscriber Badge', 'Subscriber-only Live Streams',
                ]),
            ],
            [
                'key'         => 'marketplace',
                'label'       => 'Brand Marketplace',
                'description' => 'Collaborate with brands and participate in sponsorship campaigns.',
                'mode'        => 'coming_soon',
                'sort_order'  => 4,
                'requirements' => json_encode([
                    ['key' => 'followers',  'label' => 'Followers',            'target' => 10000],
                    ['key' => 'videos',     'label' => 'Public videos',        'target' => 50],
                    ['key' => 'identity',   'label' => 'Identity verified',    'target' => null],
                    ['key' => 'guidelines', 'label' => 'No active violations', 'target' => null],
                ]),
                'unlocks' => json_encode([
                    'Brand Campaigns', 'Sponsorship Opportunities', 'Collaboration Requests',
                ]),
            ],
            [
                'key'         => 'affiliate',
                'label'       => 'Affiliate Shop',
                'description' => 'Earn commissions by promoting products.',
                'mode'        => 'coming_soon',
                'sort_order'  => 5,
                'requirements' => json_encode([
                    ['key' => 'followers',  'label' => 'Followers',            'target' => 500],
                    ['key' => 'identity',   'label' => 'Identity verified',    'target' => null],
                    ['key' => 'guidelines', 'label' => 'No active violations', 'target' => null],
                ]),
                'unlocks' => json_encode(['Product Tagging', 'Affiliate Commission', 'Sales Analytics']),
            ],
        ];
    }
};
