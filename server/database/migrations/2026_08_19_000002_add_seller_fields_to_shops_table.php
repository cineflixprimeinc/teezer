<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The seller-onboarding fields the "Sell on Reelsoo" application collects
 * about the SHOP itself (as opposed to the seller's private legal identity,
 * which lives on seller_profiles - see that migration's docblock for why
 * they're split).
 *
 * `shop_username` is a separate public handle from the owner's personal
 * account username ("@sujita" the person vs. "@lunastudio" the shop) - the
 * public Shop screen and ShopController::show() keep resolving by the
 * OWNER's account username as they already do (no route/lookup change), this
 * is purely a new display handle. `logo_url` is similarly a shop-specific
 * image, separate from the owner's personal avatar (which Shop still falls
 * back to when unset - see Shop::logoUrl()).
 *
 * `category_id` reuses the EXISTING shop_categories table (the same
 * platform-wide taxonomy products already filter against) rather than a
 * second category system.
 *
 * `policies` is the shipping/returns/support settings a seller configures
 * during onboarding (and can revisit later from Shop Settings) - grouped as
 * one JSON column because it's one cohesive, non-sensitive bundle of
 * storefront-facing operational settings, the same reasoning already applied
 * to users.notification_preferences and friends.
 *
 * `tagline` (already on the table) doubles as the "Shop Description" field
 * the application asks for - no new column for that.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shops', function (Blueprint $table) {
            $table->string('seller_type', 20)->nullable()->after('status');
            $table->char('country_code', 2)->nullable()->after('seller_type');
            $table->string('shop_username', 40)->nullable()->unique()->after('country_code');
            $table->string('logo_url')->nullable()->after('tagline');
            $table->foreignId('category_id')->nullable()->after('logo_url')
                ->constrained('shop_categories')->nullOnDelete();
            $table->json('policies')->nullable()->after('category_id');
        });
    }

    public function down(): void
    {
        Schema::table('shops', function (Blueprint $table) {
            $table->dropConstrainedForeignId('category_id');
            $table->dropColumn(['seller_type', 'country_code', 'shop_username', 'logo_url', 'policies']);
        });
    }
};
