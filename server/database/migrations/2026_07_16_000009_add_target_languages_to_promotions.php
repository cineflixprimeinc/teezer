<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Audience language targeting — advertisers can narrow delivery to viewers who
 * use specific languages. Shared across every campaign goal's custom audience.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            if (! Schema::hasColumn('promotions', 'target_languages')) {
                $table->json('target_languages')->nullable()->after('interests');
            }
        });
    }

    public function down(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            if (Schema::hasColumn('promotions', 'target_languages')) {
                $table->dropColumn('target_languages');
            }
        });
    }
};
