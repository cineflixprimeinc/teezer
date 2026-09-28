<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Ad group ("ad set"): the delivery + targeting + bid unit under a campaign.
 * Targeting is stored as jsonb (countries, age_min/max, genders, languages, interests,
 * exclusions) to match the platform's jsonb convention and keep targeting flexible.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ad_groups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('campaign_id')->constrained('ad_campaigns')->cascadeOnDelete();

            $table->string('name', 150);
            $table->string('status', 30)->default('active'); // active | paused

            $table->jsonb('placements')->nullable(); // ["in_feed","profile_top",...]
            $table->jsonb('targeting')->nullable();   // {countries,age_min,age_max,genders,languages,interests,exclusions}

            $table->string('optimization_goal', 40)->default('impressions'); // impressions | clicks | conversions | views
            $table->string('bid_type', 10)->default('cpm');                   // cpm | cpc | cpv
            $table->unsignedBigInteger('bid_cents')->default(0);
            $table->unsignedBigInteger('daily_budget_cents')->nullable();     // optional group-level cap

            $table->jsonb('meta')->nullable();
            $table->timestamps();

            $table->index('campaign_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ad_groups');
    }
};
