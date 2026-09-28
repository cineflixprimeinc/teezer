<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // TikTok-style "who can see when you're active": public | friends | no_one.
            $table->string('activity_status', 10)->default('public')->after('active_status');
        });

        // Backfill from the legacy boolean: active_status off → no_one.
        DB::table('users')->where('active_status', false)->update(['activity_status' => 'no_one']);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('activity_status');
        });
    }
};
