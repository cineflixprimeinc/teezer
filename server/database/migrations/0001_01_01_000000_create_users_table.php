<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);
            $table->string('username', 50)->unique();
            $table->string('email', 191)->unique();
            $table->string('phone', 20)->nullable()->unique();
            $table->string('password');
            $table->string('avatar')->nullable();
            $table->date('date_of_birth')->nullable();
            $table->string('country', 100)->nullable();
            $table->text('bio')->nullable();
            $table->enum('role', ['user', 'creator', 'admin'])->default('user');
            $table->boolean('is_verified')->default(false);
            $table->boolean('is_private')->default(false);
            $table->boolean('is_active')->default(true);
            $table->boolean('is_banned')->default(false);
            $table->string('ban_reason')->nullable();
            $table->rememberToken();
            $table->timestamps();
            $table->softDeletes();

            $table->index('role');
            $table->index('is_banned');
        });

        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('users');
    }
};
