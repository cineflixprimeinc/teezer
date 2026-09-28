<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('creator_analytics', function (Blueprint $table) {
            if (! Schema::hasColumn('creator_analytics', 'profile_views')) {
                $table->unsignedInteger('profile_views')->default(0)->after('watch_time_mins');
            }
            if (! Schema::hasColumn('creator_analytics', 'watch_time_secs')) {
                $table->unsignedBigInteger('watch_time_secs')->default(0)->after('profile_views');
            }
            if (! Schema::hasColumn('creator_analytics', 'total_sessions')) {
                $table->unsignedInteger('total_sessions')->default(0)->after('watch_time_secs');
            }
            if (! Schema::hasColumn('creator_analytics', 'completed_sessions')) {
                $table->unsignedInteger('completed_sessions')->default(0)->after('total_sessions');
            }
            if (! Schema::hasColumn('creator_analytics', 'replayed_sessions')) {
                $table->unsignedInteger('replayed_sessions')->default(0)->after('completed_sessions');
            }
            if (! Schema::hasColumn('creator_analytics', 'followers_snapshot')) {
                $table->unsignedInteger('followers_snapshot')->default(0)->after('lost_followers');
            }
        });
    }

    public function down(): void
    {
        Schema::table('creator_analytics', function (Blueprint $table) {
            foreach (['profile_views', 'watch_time_secs', 'total_sessions', 'completed_sessions', 'replayed_sessions', 'followers_snapshot'] as $col) {
                if (Schema::hasColumn('creator_analytics', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
