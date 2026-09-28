<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('video_watch_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('video_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->nullOnDelete();
            $table->string('session_id', 64)->unique();
            $table->string('device_id', 64)->nullable();
            $table->string('ip_hash', 64)->nullable();
            $table->timestamp('started_at')->useCurrent();
            $table->timestamp('ended_at')->nullable();
            $table->unsignedSmallInteger('watch_seconds')->default(0);
            $table->unsignedSmallInteger('max_position')->default(0);
            $table->boolean('completed')->default(false);
            $table->unsignedTinyInteger('replay_count')->default(0);
            $table->boolean('view_counted')->default(false);
            $table->timestamps();

            $table->index(['video_id', 'view_counted']);
            $table->index(['video_id', 'user_id']);
            $table->index(['video_id', 'ip_hash']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('video_watch_sessions');
    }
};
