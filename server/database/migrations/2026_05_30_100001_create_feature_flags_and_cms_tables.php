<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── CMS pages ────────────────────────────────────────────────────────
        if (!Schema::hasTable('cms_pages')) {
            Schema::create('cms_pages', function (Blueprint $table) {
                $table->id();
                $table->string('slug')->unique();
                $table->string('title');
                $table->longText('content')->nullable();
                $table->string('meta_title')->nullable();
                $table->string('meta_description')->nullable();
                $table->boolean('is_published')->default(true);
                $table->string('locale', 10)->default('en');
                $table->unsignedBigInteger('updated_by')->nullable();
                $table->foreign('updated_by')->references('id')->on('users')->nullOnDelete();
                $table->timestamps();
            });

            DB::table('cms_pages')->insert([
                ['slug' => 'terms',       'title' => 'Terms of Service',       'content' => '', 'is_published' => true,  'locale' => 'en', 'created_at' => now(), 'updated_at' => now()],
                ['slug' => 'privacy',     'title' => 'Privacy Policy',         'content' => '', 'is_published' => true,  'locale' => 'en', 'created_at' => now(), 'updated_at' => now()],
                ['slug' => 'guidelines',  'title' => 'Community Guidelines',   'content' => '', 'is_published' => true,  'locale' => 'en', 'created_at' => now(), 'updated_at' => now()],
                ['slug' => 'about',       'title' => 'About Teezer',          'content' => '', 'is_published' => true,  'locale' => 'en', 'created_at' => now(), 'updated_at' => now()],
                ['slug' => 'help',        'title' => 'Help Center',            'content' => '', 'is_published' => false, 'locale' => 'en', 'created_at' => now(), 'updated_at' => now()],
            ]);
        }

        // ── Menu items (for frontend/app nav management) ─────────────────────
        if (!Schema::hasTable('menu_items')) {
            Schema::create('menu_items', function (Blueprint $table) {
                $table->id();
                $table->string('key')->unique();
                $table->string('label');
                $table->string('icon')->nullable();
                $table->string('route')->nullable();
                $table->string('platform')->default('both'); // web, app, both
                $table->json('visibility')->nullable(); // roles that can see this: ["user","creator","admin","guest"]
                $table->boolean('is_enabled')->default(true);
                $table->unsignedSmallInteger('sort_order')->default(0);
                $table->unsignedBigInteger('parent_id')->nullable();
                $table->foreign('parent_id')->references('id')->on('menu_items')->nullOnDelete();
                $table->timestamps();
            });

            $now = now();
            DB::table('menu_items')->insert([
                ['key' => 'home',         'label' => 'For You',       'icon' => 'Home',        'route' => '/',            'platform' => 'both', 'visibility' => '["guest","user","creator","admin"]', 'is_enabled' => true, 'sort_order' => 1,  'created_at' => $now, 'updated_at' => $now],
                ['key' => 'explore',      'label' => 'Explore',       'icon' => 'Compass',     'route' => '/explore',     'platform' => 'both', 'visibility' => '["guest","user","creator","admin"]', 'is_enabled' => true, 'sort_order' => 2,  'created_at' => $now, 'updated_at' => $now],
                ['key' => 'following',    'label' => 'Following',     'icon' => 'Users',       'route' => '/following',   'platform' => 'both', 'visibility' => '["user","creator","admin"]',          'is_enabled' => true, 'sort_order' => 3,  'created_at' => $now, 'updated_at' => $now],
                ['key' => 'friends',      'label' => 'Friends',       'icon' => 'UserPlus',    'route' => '/friends',     'platform' => 'both', 'visibility' => '["user","creator","admin"]',          'is_enabled' => true, 'sort_order' => 4,  'created_at' => $now, 'updated_at' => $now],
                ['key' => 'live',         'label' => 'Live',          'icon' => 'Radio',       'route' => '/live',        'platform' => 'both', 'visibility' => '["user","creator","admin"]',          'is_enabled' => true, 'sort_order' => 5,  'created_at' => $now, 'updated_at' => $now],
                ['key' => 'messages',     'label' => 'Messages',      'icon' => 'MessageCircle','route' => '/messages',   'platform' => 'both', 'visibility' => '["user","creator","admin"]',          'is_enabled' => true, 'sort_order' => 6,  'created_at' => $now, 'updated_at' => $now],
                ['key' => 'notifications','label' => 'Notifications', 'icon' => 'Bell',        'route' => '/notifications','platform' => 'both', 'visibility' => '["user","creator","admin"]',          'is_enabled' => true, 'sort_order' => 7,  'created_at' => $now, 'updated_at' => $now],
                ['key' => 'upload',       'label' => 'Upload',        'icon' => 'Plus',        'route' => '/upload',      'platform' => 'both', 'visibility' => '["user","creator","admin"]',          'is_enabled' => true, 'sort_order' => 8,  'created_at' => $now, 'updated_at' => $now],
                ['key' => 'profile',      'label' => 'Profile',       'icon' => 'User',        'route' => '/profile/me',  'platform' => 'both', 'visibility' => '["user","creator","admin"]',          'is_enabled' => true, 'sort_order' => 9,  'created_at' => $now, 'updated_at' => $now],
                ['key' => 'studio',       'label' => 'Studio',        'icon' => 'Clapperboard','route' => '/studio',      'platform' => 'both', 'visibility' => '["creator","admin"]',                 'is_enabled' => true, 'sort_order' => 10, 'created_at' => $now, 'updated_at' => $now],
                ['key' => 'wallet',       'label' => 'Wallet',        'icon' => 'Wallet',      'route' => '/wallet',      'platform' => 'both', 'visibility' => '["user","creator","admin"]',          'is_enabled' => true, 'sort_order' => 11, 'created_at' => $now, 'updated_at' => $now],
                ['key' => 'settings',     'label' => 'Settings',      'icon' => 'Settings',    'route' => '/settings/account','platform' => 'both', 'visibility' => '["user","creator","admin"]',      'is_enabled' => true, 'sort_order' => 12, 'created_at' => $now, 'updated_at' => $now],
            ]);
        }

        // ── Seed default feature flags into app_settings if not present ───────
        $flags = [
            ['key' => 'feature_live',           'value' => '1', 'type' => 'boolean', 'group' => 'features', 'description' => 'Enable Live Streaming'],
            ['key' => 'feature_stories',        'value' => '1', 'type' => 'boolean', 'group' => 'features', 'description' => 'Enable Stories'],
            ['key' => 'feature_messages',       'value' => '1', 'type' => 'boolean', 'group' => 'features', 'description' => 'Enable Direct Messages'],
            ['key' => 'feature_studio',         'value' => '1', 'type' => 'boolean', 'group' => 'features', 'description' => 'Enable Creator Studio'],
            ['key' => 'feature_monetization',   'value' => '1', 'type' => 'boolean', 'group' => 'features', 'description' => 'Enable Creator Monetization'],
            ['key' => 'feature_ads',            'value' => '0', 'type' => 'boolean', 'group' => 'features', 'description' => 'Enable Ads Manager'],
            ['key' => 'feature_wallet',         'value' => '1', 'type' => 'boolean', 'group' => 'features', 'description' => 'Enable Wallet / Coins'],
            ['key' => 'feature_verification',   'value' => '1', 'type' => 'boolean', 'group' => 'features', 'description' => 'Enable Creator Verification'],
            ['key' => 'feature_comments',       'value' => '1', 'type' => 'boolean', 'group' => 'features', 'description' => 'Enable Comments'],
            ['key' => 'feature_downloads',      'value' => '1', 'type' => 'boolean', 'group' => 'features', 'description' => 'Enable Video Downloads'],
            ['key' => 'feature_duet',           'value' => '1', 'type' => 'boolean', 'group' => 'features', 'description' => 'Enable Duet'],
            ['key' => 'feature_stitch',         'value' => '1', 'type' => 'boolean', 'group' => 'features', 'description' => 'Enable Stitch'],
            ['key' => 'feature_country_lock',   'value' => '1', 'type' => 'boolean', 'group' => 'features', 'description' => 'Enable Country Lock (60-day)'],
            ['key' => 'feature_search',         'value' => '1', 'type' => 'boolean', 'group' => 'features', 'description' => 'Enable Search'],
            ['key' => 'feature_creator_levels', 'value' => '1', 'type' => 'boolean', 'group' => 'features', 'description' => 'Enable Creator Level System'],
            ['key' => 'feature_audio_rooms',    'value' => '1', 'type' => 'boolean', 'group' => 'features', 'description' => 'Enable Audio Rooms'],
            ['key' => 'feature_notifications',  'value' => '1', 'type' => 'boolean', 'group' => 'features', 'description' => 'Enable Push Notifications'],
        ];

        foreach ($flags as $flag) {
            DB::table('app_settings')->updateOrInsert(
                ['key' => $flag['key']],
                array_merge($flag, ['is_public' => false, 'created_at' => now(), 'updated_at' => now()])
            );
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('menu_items');
        Schema::dropIfExists('cms_pages');
    }
};
