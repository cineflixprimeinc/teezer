<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('video_hashtags', function (Blueprint $table) {
            if (! Schema::hasColumn('video_hashtags', 'country_code')) {
                $table->char('country_code', 2)->nullable()->after('hashtag_id')->index();
            }

            if (! Schema::hasColumn('video_hashtags', 'country_name')) {
                $table->string('country_name', 100)->nullable()->after('country_code')->index();
            }

            if (! Schema::hasColumn('video_hashtags', 'created_at')) {
                $table->timestamps();
            }
        });
    }

    public function down(): void
    {
        Schema::table('video_hashtags', function (Blueprint $table) {
            foreach (['country_code', 'country_name'] as $column) {
                if (Schema::hasColumn('video_hashtags', $column)) {
                    $table->dropIndex([$column]);
                }
            }

            foreach (['country_code', 'country_name', 'created_at', 'updated_at'] as $column) {
                if (Schema::hasColumn('video_hashtags', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
