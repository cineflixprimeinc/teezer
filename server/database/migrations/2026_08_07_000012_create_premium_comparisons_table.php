<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The premium page's "FREE VS PREMIUM" matrix - one row per compared feature.
 *
 * `values` is keyed by `subscription_plans.key`, e.g.
 *   {"starter": "1080p", "pro": "4K60", "studio": "4K80"}
 * so a row does not have to carry a column per tier and adding a fourth tier
 * needs no migration. A key with no entry renders as the design's em dash,
 * which is why a missing value is meaningful rather than an error.
 *
 * `highlight_plan` is the tier drawn emphasised in that row (the pink pill on
 * Pro in the design). Nullable - most rows highlight nothing.
 *
 * No foreign key on the plan keys inside the JSON: they are denormalised on
 * purpose so an admin can retire a tier without every comparison row failing to
 * save. The controller only emits values for tiers that are currently enabled.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('premium_comparisons', function (Blueprint $table) {
            $table->id();
            $table->string('label');
            $table->json('values')->nullable();
            $table->string('highlight_plan')->nullable();
            $table->unsignedInteger('sort')->default(0);
            $table->boolean('is_enabled')->default(true);
            $table->timestamps();

            $table->index(['is_enabled', 'sort']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('premium_comparisons');
    }
};
