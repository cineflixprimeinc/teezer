<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('audio_tracks', function (Blueprint $table) {
            $table->string('mood', 50)->nullable()->after('duration');
            $table->string('genre', 50)->nullable()->after('mood');
            $table->string('usage_rights', 50)->nullable()->default('attribution_required')->after('genre');
        });
    }

    public function down(): void
    {
        Schema::table('audio_tracks', function (Blueprint $table) {
            $table->dropColumn(['mood', 'genre', 'usage_rights']);
        });
    }
};
