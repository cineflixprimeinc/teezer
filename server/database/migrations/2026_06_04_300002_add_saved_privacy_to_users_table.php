<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // 'private' = only owner sees it
            // 'followers' = followers can see it
            // 'public' = anyone can see it
            $table->string('saved_privacy', 20)->default('private')->after('save_watch_history');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('saved_privacy');
        });
    }
};
