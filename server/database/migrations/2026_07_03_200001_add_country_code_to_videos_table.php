<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            // Creator's country at publish time - drives the per-country feed
            // pools (trending:country:{CC}, fresh:country:{CC}).
            $table->char('country_code', 2)->nullable()->index();
        });

        // Backfill from the creator - same precedence VideoService uses for the
        // hashtag pivot: selected country first, then the detected one.
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("
                UPDATE videos v
                   SET country_code = UPPER(COALESCE(NULLIF(u.selected_country_code, ''), NULLIF(u.detected_country_code, '')))
                  FROM users u
                 WHERE u.id = v.user_id
                   AND v.country_code IS NULL
            ");
        }
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->dropIndex(['country_code']);
            $table->dropColumn('country_code');
        });
    }
};
