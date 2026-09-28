<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('video_views', function (Blueprint $table) {
            if (! Schema::hasColumn('video_views', 'source')) {
                $table->string('source', 50)->nullable()->after('watch_duration');
            }
            if (! Schema::hasColumn('video_views', 'country')) {
                $table->string('country', 100)->nullable()->after('source');
            }
            if (! Schema::hasColumn('video_views', 'city')) {
                $table->string('city', 100)->nullable()->after('country');
            }
        });
    }

    public function down(): void
    {
        Schema::table('video_views', function (Blueprint $table) {
            foreach (['source', 'country', 'city'] as $col) {
                if (Schema::hasColumn('video_views', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
