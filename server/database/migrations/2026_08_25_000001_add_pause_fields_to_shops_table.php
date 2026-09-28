<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Seller self-service "Pause Shop" (Shop Settings > Shop Operations), plus
 * a shop-scoped notification-preferences JSON column - same pattern as
 * users.notification_preferences (2026_06_04_960001), just scoped to the
 * shop instead of the account.
 *
 * No new boolean/flag for "paused" - Shop::STATUS_PAUSED is added as a new
 * value of the EXISTING `status` column instead (see Shop.php), for the
 * exact reason the 2026_08_19_000001 migration already gives for using one
 * status column rather than status + a separate is_active/is_paused flag: a
 * second boolean could only ever disagree with status, never add real
 * information. Every place that already gates on Shop::isApproved()
 * (`status === approved`) - the storefront, product reads, checkout -
 * therefore treats a paused shop exactly like a suspended one, with zero
 * code changes anywhere else.
 *
 * paused_until/pause_message are genuinely new data (an optional resume
 * date and a message), not derivable from status, so they get real columns.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shops', function (Blueprint $table) {
            $table->timestamp('paused_until')->nullable()->after('status');
            $table->text('pause_message')->nullable()->after('paused_until');
            $table->json('notification_preferences')->nullable()->after('policies');
        });
    }

    public function down(): void
    {
        Schema::table('shops', function (Blueprint $table) {
            $table->dropColumn(['paused_until', 'pause_message', 'notification_preferences']);
        });
    }
};
