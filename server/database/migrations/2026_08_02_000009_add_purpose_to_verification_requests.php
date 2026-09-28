<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Splits verification into the two things it was always doing at once.
 *
 *   badge     the blue tick. A paid subscription plus an ID review, unchanged.
 *   identity  an ID review ONLY, free, for monetization eligibility.
 *
 * Four of the five monetization programmes require "identity verified". Making
 * that mean "buy a badge" would put a $5-20/month subscription between a
 * creator and their own earnings, which is not what a verification requirement
 * is for. Same documents, same reviewers, same queue - no payment, and no tick.
 *
 * Existing rows are all `badge`: every verification taken so far went through
 * the paid flow, so backfilling anything else would rewrite history.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('verification_requests')) {
            return;
        }

        if (! Schema::hasColumn('verification_requests', 'purpose')) {
            Schema::table('verification_requests', function (Blueprint $table) {
                $table->string('purpose', 20)->default('badge')->after('status');
                // The engine asks "does this user have an approved identity
                // check", which is exactly this pair.
                $table->index(['user_id', 'purpose', 'status']);
            });

            DB::table('verification_requests')->whereNull('purpose')->update(['purpose' => 'badge']);
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('verification_requests')) {
            return;
        }

        Schema::table('verification_requests', function (Blueprint $table) {
            if (Schema::hasColumn('verification_requests', 'purpose')) {
                $table->dropIndex(['user_id', 'purpose', 'status']);
                $table->dropColumn('purpose');
            }
        });
    }
};
