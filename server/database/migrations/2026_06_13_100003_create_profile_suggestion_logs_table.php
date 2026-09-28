<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('profile_suggestion_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('suggested_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('context', 30)->default('home'); // home, profile, friends, following_empty, search
            $table->decimal('score', 6, 4)->default(0);
            $table->string('reason', 255)->nullable();
            $table->timestamp('shown_at')->useCurrent();
            $table->timestamp('clicked_at')->nullable();
            $table->timestamp('followed_at')->nullable();

            $table->index(['user_id', 'shown_at']);
            $table->index(['user_id', 'context']);
            $table->index('followed_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('profile_suggestion_logs');
    }
};
