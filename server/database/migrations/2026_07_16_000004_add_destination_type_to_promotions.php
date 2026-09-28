<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Website Traffic" campaigns send people to an external website or a Teezer
 * Instant Page. `destination_type` records which; the URL (when a website) reuses
 * the existing destination_url column.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            if (! Schema::hasColumn('promotions', 'destination_type')) {
                $table->string('destination_type', 20)->nullable()->after('destination_url');
            }
        });
    }

    public function down(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            if (Schema::hasColumn('promotions', 'destination_type')) {
                $table->dropColumn('destination_type');
            }
        });
    }
};
