<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

/**
 * Configurable ad surfaces + insertion cadence + price floor. Seeded with the six
 * placements from the campaign wizard; only in_feed + profile_top are enabled initially.
 * Reference data is seeded here (idempotent) so it exists right after migrate.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ad_placements', function (Blueprint $table) {
            $table->id();
            $table->string('key', 40)->unique(); // in_feed | profile_top | hashtag | search | explore | inbox
            $table->string('name', 80);
            $table->string('description', 200)->nullable();
            $table->boolean('is_enabled')->default(false);
            $table->unsignedSmallInteger('first_slot')->default(4);   // first sponsored position
            $table->unsignedSmallInteger('cadence')->default(6);      // then every N items
            $table->unsignedBigInteger('floor_cpm_cents')->default(0);
            $table->jsonb('spec')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        $now = now();
        $rows = [
            ['key' => 'in_feed',     'name' => 'In-Feed Videos', 'description' => 'Ad appears between videos in the For You feed.', 'is_enabled' => true,  'first_slot' => 4, 'cadence' => 6, 'sort_order' => 1],
            ['key' => 'profile_top', 'name' => 'Profile Top',    'description' => 'Banner at the top of user profiles.',            'is_enabled' => true,  'first_slot' => 0, 'cadence' => 0, 'sort_order' => 2],
            ['key' => 'hashtag',     'name' => 'Hashtag Page',   'description' => 'Ad shown on hashtag pages.',                     'is_enabled' => false, 'first_slot' => 6, 'cadence' => 8, 'sort_order' => 3],
            ['key' => 'search',      'name' => 'Search Results', 'description' => 'Ad shown in search results.',                    'is_enabled' => false, 'first_slot' => 3, 'cadence' => 8, 'sort_order' => 4],
            ['key' => 'explore',     'name' => 'Explore Page',   'description' => 'Ad shown on the explore grid.',                  'is_enabled' => false, 'first_slot' => 5, 'cadence' => 9, 'sort_order' => 5],
            ['key' => 'inbox',       'name' => 'Inbox',          'description' => 'Ad shown in the inbox / messages surface.',      'is_enabled' => false, 'first_slot' => 2, 'cadence' => 0, 'sort_order' => 6],
        ];
        foreach ($rows as $r) {
            DB::table('ad_placements')->updateOrInsert(
                ['key' => $r['key']],
                array_merge($r, ['floor_cpm_cents' => 0, 'created_at' => $now, 'updated_at' => $now])
            );
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('ad_placements');
    }
};
