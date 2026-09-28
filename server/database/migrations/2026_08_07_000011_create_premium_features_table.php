<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The premium page's "WHAT YOU GET" grid - the two-column cards under the plans.
 *
 * Separate from `subscription_plans.features` on purpose: those are the ticked
 * one-liners inside a single tier's card, this is the illustrated grid that
 * sells the product as a whole and is not owned by any one tier. Same words
 * would otherwise have to be repeated across all three plans.
 *
 * `icon` is a key the app maps to a drawn glyph, not an image URL. The app
 * ships vector glyphs (lucide-react-native / react-native-svg) and an unknown
 * key falls back to a neutral glyph, so adding a card in the admin panel can
 * never leave a broken image in the grid.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('premium_features', function (Blueprint $table) {
            $table->id();
            $table->string('icon', 64)->default('sparkles');
            $table->string('title');
            $table->text('description')->nullable();
            // The design's pink "NEW" pill. Free text so it can also read
            // "BETA" or "SOON" without a schema change.
            $table->string('badge', 24)->nullable();
            $table->unsignedInteger('sort')->default(0);
            $table->boolean('is_enabled')->default(true);
            $table->timestamps();

            $table->index(['is_enabled', 'sort']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('premium_features');
    }
};
