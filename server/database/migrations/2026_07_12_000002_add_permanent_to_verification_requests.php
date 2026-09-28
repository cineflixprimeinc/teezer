<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Two kinds of verified account.
 *
 *  - SUBSCRIPTION (the default): a Blue Verified plan. The badge runs for one plan
 *    period from approval, and the creator must renew to keep it.
 *  - PERMANENT: staff, official and system accounts. No plan, no renewal, no expiry.
 *
 * This needs its own column rather than reusing `expires_at IS NULL`, because NULL
 * already means something else: "approved before expiry was tracked, renewal date
 * unknown". Collapsing the two would make a legacy badge indistinguishable from a
 * deliberate permanent grant - and the UI would then have to guess which it was
 * looking at.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('verification_requests', function (Blueprint $table) {
            $table->boolean('is_permanent')->default(false)->after('expires_at');
        });
    }

    public function down(): void
    {
        Schema::table('verification_requests', function (Blueprint $table) {
            $table->dropColumn('is_permanent');
        });
    }
};
