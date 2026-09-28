<?php

use App\Models\CoinOrder;
use App\Models\CoinPackage;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Delete the 100 legacy coin packs.
 *
 * They came from CoinPackageSeeder (now removed): plain coin bundles from the old
 * pricing model - Starter Spark, Quick Glow, Creator Vault, Business Pack and so on.
 * They have no gift artwork and no `gifts` row, so they could be bought but never
 * sent. They were already deactivated when the 200-gift catalog landed, which is why
 * the storefront shows exactly 200 - but they still cluttered the admin panel.
 *
 * Two of them (Starter Spark, Enterprise Pack) sit behind 5 coin_orders. Those were
 * TEST purchases - confirmed by the account owner - so they go too. This is the only
 * reason it is safe: `coin_orders.package_id` is ON DELETE RESTRICT, so the orders
 * must be cleared first or Postgres refuses the delete.
 *
 * Scope is deliberately narrow: only orders pointing at a LEGACY (inactive) pack are
 * removed. A real purchase from the live 200-gift catalog is never touched.
 */
return new class extends Migration
{
    public function up(): void
    {
        $legacyIds = CoinPackage::where('is_active', false)->pluck('id');

        if ($legacyIds->isEmpty()) {
            return;
        }

        DB::transaction(function () use ($legacyIds) {
            // The FK is RESTRICT, so the referencing orders must go first.
            CoinOrder::whereIn('package_id', $legacyIds)->delete();
            CoinPackage::whereIn('id', $legacyIds)->delete();
        });
    }

    public function down(): void
    {
        // Deliberately irreversible. These were dead rows from a pricing model that no
        // longer exists, plus their test orders; recreating them would put junk back in
        // the catalog. The seeder that made them is gone too.
    }
};
