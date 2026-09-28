<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            if (!Schema::hasColumn('videos', 'category')) {
                $table->string('category', 100)->nullable()->after('caption');
            }
            if (!Schema::hasColumn('videos', 'location')) {
                $table->string('location', 255)->nullable()->after('category');
            }
            if (!Schema::hasColumn('videos', 'language')) {
                $table->string('language', 10)->nullable()->default('en')->after('location');
            }
            if (!Schema::hasColumn('videos', 'allow_download')) {
                $table->boolean('allow_download')->default(false)->after('allow_stitch');
            }
        });
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            foreach (['category', 'location', 'language', 'allow_download'] as $col) {
                if (Schema::hasColumn('videos', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
