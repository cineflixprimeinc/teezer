<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Blue Verified is a SUBSCRIPTION (Basic/Plus/Business are all priced per month,
 * and `annual` exists as a plan id) - but nothing recorded when a verification
 * actually lapses. There was no expires_at anywhere, so the apps had no honest way
 * to tell a creator when their badge renews.
 *
 * Nullable on purpose: rows approved BEFORE this migration have no expiry, and we
 * must not invent one for them. `expires_at IS NULL` on an approved row means
 * "verified, renewal date unknown" - which the UI states plainly rather than
 * computing a date that no billing system would honour.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('verification_requests', function (Blueprint $table) {
            $table->timestamp('expires_at')->nullable()->after('reviewed_at');
        });
    }

    public function down(): void
    {
        Schema::table('verification_requests', function (Blueprint $table) {
            $table->dropColumn('expires_at');
        });
    }
};
