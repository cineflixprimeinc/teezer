<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            // JSON map of restriction_key => ISO date string (null = no expiry)
            // e.g. {"shadow_restricted":"2026-07-01","dm_restricted":null}
            $table->json('restrictions_config')->nullable()->after('admin_muted_at');
            // Free-text note admin attaches when applying restrictions
            $table->string('admin_note', 1000)->nullable()->after('restrictions_config');
        });
    }

    public function down(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            $table->dropColumn(['restrictions_config', 'admin_note']);
        });
    }
};
