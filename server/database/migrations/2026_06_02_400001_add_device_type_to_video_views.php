<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('video_views', function (Blueprint $table) {
            if (! Schema::hasColumn('video_views', 'device_type')) {
                $table->string('device_type', 20)->nullable()->after('city');
                $table->index(['video_id', 'device_type']);
            }
        });
    }

    public function down(): void
    {
        Schema::table('video_views', function (Blueprint $table) {
            if (Schema::hasColumn('video_views', 'device_type')) {
                $table->dropIndex(['video_id', 'device_type']);
                $table->dropColumn('device_type');
            }
        });
    }
};
