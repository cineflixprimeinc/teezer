<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lets an admin override a programme's CTA button text (Admin Panel ->
 * Monetization Control Center -> [programme] -> Overview) - e.g. rename
 * "Get Started" to something else for Gifts & Coins - without a client
 * release. Null means "use the client's own default label" for that
 * programme (Get Started / Apply Now / Notify Me When It Opens / etc.),
 * same fallback pattern every other optional override on this table
 * already follows (commission_rate, min_payout).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('monetization_programs', function (Blueprint $table) {
            $table->string('cta_label', 40)->nullable()->after('notice');
        });
    }

    public function down(): void
    {
        Schema::table('monetization_programs', function (Blueprint $table) {
            $table->dropColumn('cta_label');
        });
    }
};
