<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // TikTok-style "Profile view history": when off, the user can't see who
            // viewed them AND they browse other profiles invisibly (reciprocal).
            $table->boolean('profile_view_history')->default(true)->after('comment_filter');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('profile_view_history');
        });
    }
};
