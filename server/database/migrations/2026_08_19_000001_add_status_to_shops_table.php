<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The Shop lifecycle status the "Sell on Reelsoo" seller-onboarding system
 * needs and the original shops table (2026_08_18_000001) never had - today a
 * Shop row existing at all is treated as "this is a real, public storefront",
 * which is exactly the zero-friction behaviour the seller-onboarding feature
 * removes: a shop is now only a real, publicly visible storefront once an
 * admin has approved it.
 *
 * Defaulting to 'draft' (not 'approved') is what keeps every Shop row that
 * already exists - including ones auto-provisioned by the old
 * ShopController::storeProduct zero-friction path - from suddenly becoming
 * publicly visible the moment this column exists. Nothing is auto-approved.
 *
 * A single `status` column (rather than `status` + a separate `is_active`
 * flag) is the sole gate: 'suspended' already represents "was approved, no
 * longer is" as its own value, so a second boolean would only be able to
 * disagree with `status`, never add real information.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shops', function (Blueprint $table) {
            // The column's own DEFAULT applies to every existing row the
            // moment it's added - no separate backfill needed, and no shop
            // (including ones the old zero-friction ShopController::storeProduct
            // path already created) ends up approved by this migration.
            $table->string('status', 20)->default('draft')->after('user_id');
        });
    }

    public function down(): void
    {
        Schema::table('shops', function (Blueprint $table) {
            $table->dropColumn('status');
        });
    }
};
