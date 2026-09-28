<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_moderation_settings', function (Blueprint $table) {
            $table->timestamp('temporary_suspension_until')->nullable()->after('temporary_suspension');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('suspended_until')->nullable()->after('ban_reason');
        });
    }

    public function down(): void
    {
        Schema::table('user_moderation_settings', function (Blueprint $table) {
            $table->dropColumn('temporary_suspension_until');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('suspended_until');
        });
    }
};
