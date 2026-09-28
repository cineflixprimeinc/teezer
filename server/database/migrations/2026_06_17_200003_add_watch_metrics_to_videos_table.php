<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            if (!Schema::hasColumn('videos', 'total_watch_seconds')) {
                $table->unsignedBigInteger('total_watch_seconds')->default(0)->after('views_count');
            }
            if (!Schema::hasColumn('videos', 'average_watch_seconds')) {
                $table->unsignedSmallInteger('average_watch_seconds')->default(0)->after('total_watch_seconds');
            }
            if (!Schema::hasColumn('videos', 'completion_rate')) {
                $table->unsignedTinyInteger('completion_rate')->default(0)->after('average_watch_seconds');
            }
            if (!Schema::hasColumn('videos', 'rewatch_rate')) {
                $table->unsignedTinyInteger('rewatch_rate')->default(0)->after('completion_rate');
            }
            if (!Schema::hasColumn('videos', 'total_completions')) {
                $table->unsignedInteger('total_completions')->default(0)->after('rewatch_rate');
            }
            if (!Schema::hasColumn('videos', 'total_replays')) {
                $table->unsignedInteger('total_replays')->default(0)->after('total_completions');
            }
        });
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $cols     = ['total_watch_seconds','average_watch_seconds','completion_rate','rewatch_rate','total_completions','total_replays'];
            $existing = array_filter($cols, fn ($c) => Schema::hasColumn('videos', $c));
            if ($existing) { $table->dropColumn(array_values($existing)); }
        });
    }
};
