<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_moderation_settings', function (Blueprint $table) {
            if (!Schema::hasColumn('user_moderation_settings', 'allow_dm')) {
                $table->string('allow_dm', 20)->default('everyone');
            }
            if (!Schema::hasColumn('user_moderation_settings', 'allow_mentions')) {
                $table->string('allow_mentions', 20)->default('everyone');
            }
            if (!Schema::hasColumn('user_moderation_settings', 'content_filter')) {
                $table->string('content_filter', 20)->default('standard');
            }
            if (!Schema::hasColumn('user_moderation_settings', 'sensitive_filter')) {
                $table->boolean('sensitive_filter')->default(true);
            }
            if (!Schema::hasColumn('user_moderation_settings', 'activity_visibility')) {
                $table->string('activity_visibility', 20)->default('everyone');
            }
        });
    }

    public function down(): void
    {
        Schema::table('user_moderation_settings', function (Blueprint $table) {
            $table->dropColumn([
                'allow_dm', 'allow_mentions', 'content_filter',
                'sensitive_filter', 'activity_visibility',
            ]);
        });
    }
};
