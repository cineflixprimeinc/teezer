<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Detailed audience demographics + behaviours (relationship status, education,
 * parental status, behaviour segments) — shared across every campaign goal's
 * custom audience. Stored as JSON on the promotion.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            if (! Schema::hasColumn('promotions', 'demographics')) {
                $table->json('demographics')->nullable()->after('target_languages');
            }
        });
    }

    public function down(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            if (Schema::hasColumn('promotions', 'demographics')) {
                $table->dropColumn('demographics');
            }
        });
    }
};
