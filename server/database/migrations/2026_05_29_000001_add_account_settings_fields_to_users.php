<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'gender')) {
                $table->string('gender', 32)->nullable()->after('date_of_birth');
            }
            if (!Schema::hasColumn('users', 'language')) {
                $table->string('language', 8)->default('en')->after('gender');
            }
            if (!Schema::hasColumn('users', 'interests')) {
                $table->json('interests')->nullable()->after('language');
            }
            if (!Schema::hasColumn('users', 'website')) {
                $table->string('website', 500)->nullable()->after('bio');
            }
            if (!Schema::hasColumn('users', 'location')) {
                $table->string('location', 255)->nullable()->after('country');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            foreach (['gender', 'language', 'interests', 'website', 'location'] as $col) {
                if (Schema::hasColumn('users', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
