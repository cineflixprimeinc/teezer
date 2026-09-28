<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Structured plan features - the entitlement system.
 *
 * `subscription_plans.features` is a JSON array of display STRINGS ("4K
 * uploads"). It is what the plan card prints and nothing more: no client can
 * ask "is this user allowed to upload 4K, and up to what limit" without parsing
 * marketing copy. `premium_features` is a different thing again - the global
 * "WHAT YOU GET" grid on the premium page, not per-plan.
 *
 * So neither existing table can answer an entitlement question, which is what
 * the app, the website and anything built later actually need. Two new tables:
 *
 *   plan_feature_catalog - the library. One row per feature that EXISTS.
 *   plan_features        - per plan: is it on, and with what limit.
 *
 * Split because the catalog is shared. A feature's name, icon, group and the
 * set of values it can take are properties of the feature, not of one plan, and
 * duplicating them per plan is how three plans end up disagreeing about what
 * "Cloud Storage" is called.
 *
 * `subscription_plans.features` is KEPT and kept in sync by PlanFeatureService -
 * the mobile app and the website both read it today, and breaking the plan card
 * to add entitlements would be a regression traded for a feature.
 *
 * value_type drives the editor and the resolver together:
 *   boolean - on/off. `value` is null; "Unlimited" is just how ON is drawn.
 *   select  - one of `options`. `value` holds the chosen option's value.
 * Storing `value` as text rather than a number is deliberate: "100 GB",
 * "1080p" and "10" are not the same kind of quantity, and forcing them into one
 * numeric column would need a unit column beside it to mean anything.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('plan_feature_catalog', function (Blueprint $table) {
            $table->id();
            // Stable identifier. This is what clients switch on, so it must not
            // change when the display name does.
            $table->string('key', 64)->unique();
            $table->string('name', 120);
            $table->string('description', 255)->nullable();
            // Lucide icon name, resolved client-side - storing SVG here would
            // put markup in the database and pin both clients to one renderer.
            $table->string('icon', 64)->nullable();
            $table->string('group_key', 64)->nullable();
            $table->string('value_type', 16)->default('boolean');
            $table->json('options')->nullable();
            $table->string('default_value', 64)->nullable();
            $table->unsignedInteger('sort')->default(0);
            $table->boolean('is_enabled')->default(true);
            $table->timestamps();

            $table->index(['group_key', 'sort'], 'idx_plan_feature_catalog_group');
        });

        Schema::create('plan_features', function (Blueprint $table) {
            $table->id();
            $table->foreignId('subscription_plan_id')->constrained('subscription_plans')->cascadeOnDelete();
            // By KEY, not by catalog id: a feature removed from the catalog and
            // re-added must not silently re-enable itself on every plan that
            // once had it.
            $table->string('feature_key', 64);
            $table->boolean('is_enabled')->default(true);
            $table->string('value', 64)->nullable();
            $table->unsignedInteger('sort')->default(0);
            $table->timestamps();

            // One row per feature per plan. The editor upserts on this, so a
            // double-submit cannot produce two conflicting settings.
            $table->unique(['subscription_plan_id', 'feature_key'], 'uq_plan_features_plan_key');
            $table->index('feature_key', 'idx_plan_features_key');
        });

        $this->seedCatalog();
    }

    public function down(): void
    {
        Schema::dropIfExists('plan_features');
        Schema::dropIfExists('plan_feature_catalog');
    }

    /**
     * Seed the catalog.
     *
     * updateOrInsert keyed on `key`, so a re-run is idempotent and an admin's
     * later edit to a name or icon is NOT overwritten by re-running the
     * migration - only genuinely new rows are added.
     */
    private function seedCatalog(): void
    {
        $now = now();
        $rows = [
            // Content & Experience
            ['remove_ads', 'Remove Ads', 'Enjoy an ad-free experience across the app.', 'Ban', 'content', 'boolean', null, null],
            ['download_videos', 'Download Videos', 'Download videos to watch offline.', 'Download', 'content', 'boolean', null, null],
            ['early_access', 'Early Access', 'Access new features early.', 'Sparkles', 'content', 'boolean', null, null],
            ['advanced_filters', 'Advanced Filters', 'Access advanced filters.', 'Filter', 'content', 'boolean', null, null],
            ['playlist_creation', 'Playlist Creation', 'Create and manage playlists.', 'ListMusic', 'content', 'boolean', null, null],

            // Storage & Quality
            ['cloud_storage', 'Cloud Storage', 'Extra cloud storage for your media and files.', 'CloudUpload', 'storage', 'select',
                ['10 GB', '50 GB', '100 GB', '500 GB', '1 TB', 'Unlimited'], '100 GB'],
            ['upload_quality', 'Upload Quality', 'Upload videos in higher resolution.', 'Image', 'storage', 'select',
                ['480p', '720p', '1080p', '1440p', '4K'], '1080p'],
            ['custom_thumbnails', 'Custom Thumbnails', 'Upload custom video thumbnails.', 'ImagePlus', 'storage', 'boolean', null, null],
            ['live_streaming', 'Live Streaming', 'Go live with high quality.', 'Radio', 'storage', 'select',
                ['720p', '1080p', '4K'], '1080p'],

            // Creator & Tools
            ['analytics', 'Analytics', 'Advanced analytics for your content.', 'TrendingUp', 'creator', 'select',
                ['Basic', 'Advanced', 'Pro'], 'Advanced'],
            ['creator_tools', 'Creator Tools', 'Access to exclusive creator tools.', 'Star', 'creator', 'select',
                ['Limited', 'Standard', 'All Tools'], 'All Tools'],
            ['monetization_tools', 'Monetization Tools', 'Access monetization features.', 'CircleDollarSign', 'creator', 'boolean', null, null],
            ['priority_support', 'Priority Support', 'Get priority customer support.', 'LifeBuoy', 'creator', 'boolean', null, null],

            // Account & Identity
            ['collaboration', 'Collaboration', 'Collaborate with more members.', 'Users', 'account', 'select',
                ['2 Members', '5 Members', '10 Members', '25 Members', 'Unlimited'], '10 Members'],
            ['verified_badge', 'Verified Badge', 'Get a verified badge on your profile.', 'BadgeCheck', 'account', 'boolean', null, null],
            ['multiple_devices', 'Multiple Devices', 'Use on multiple devices.', 'MonitorSmartphone', 'account', 'select',
                ['1 Device', '2 Devices', '5 Devices', 'Unlimited'], '5 Devices'],
        ];

        foreach ($rows as $i => [$key, $name, $desc, $icon, $group, $type, $options, $default]) {
            DB::table('plan_feature_catalog')->updateOrInsert(
                ['key' => $key],
                [
                    'name' => $name, 'description' => $desc, 'icon' => $icon,
                    'group_key' => $group, 'value_type' => $type,
                    'options' => $options ? json_encode($options) : null,
                    'default_value' => $default, 'sort' => $i * 10,
                    'is_enabled' => true, 'updated_at' => $now,
                    'created_at' => $now,
                ],
            );
        }
    }
};
