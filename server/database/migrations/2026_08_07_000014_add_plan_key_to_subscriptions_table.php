<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which tier a subscription actually is.
 *
 * `subscriptions.plan` is 'monthly'|'annual' - a billing *period*, not a
 * product. With one product that was enough; with Starter / Pro / Studio it is
 * not, and a Studio subscriber was indistinguishable from a Pro one. Every
 * entitlement question ("does this user get team seats?") needs this column.
 *
 * Nullable, and `plan` is left exactly as it is: every existing row predates
 * tiers and belongs to the single legacy product. A null plan_key therefore
 * means "the old single Premium", which is true rather than a gap to backfill -
 * guessing a tier for historical subscribers would invent entitlements nobody
 * paid for.
 *
 * No foreign key to subscription_plans.key on purpose: a tier may be retired
 * from sale while people are still subscribed to it, and their rows must
 * survive that. This records what was bought, which stays true even after the
 * product stops being offered.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subscriptions', function (Blueprint $table) {
            $table->string('plan_key')->nullable()->after('plan');
            $table->index('plan_key');
        });
    }

    public function down(): void
    {
        Schema::table('subscriptions', function (Blueprint $table) {
            $table->dropIndex(['plan_key']);
            $table->dropColumn('plan_key');
        });
    }
};
