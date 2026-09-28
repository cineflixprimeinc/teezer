<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('followers', function (Blueprint $table) {
            $table->enum('status', ['accepted', 'pending', 'rejected'])
                  ->default('accepted')
                  ->after('following_id');
        });
    }

    public function down(): void
    {
        Schema::table('followers', function (Blueprint $table) {
            $table->dropColumn('status');
        });
    }
};
