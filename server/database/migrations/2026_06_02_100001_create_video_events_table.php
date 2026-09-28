<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('video_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('video_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->nullOnDelete();
            $table->string('session_id', 64)->nullable();
            $table->enum('event_type', [
                'view_progress',
                'skip',
                'rewatch',
                'like',
                'comment',
                'share',
                'save',
                'follow_from_video',
                'not_interested',
                'report',
            ]);
            $table->json('payload')->nullable(); // e.g. completion_pct, watch_duration, platform
            $table->string('ip_address', 45)->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['video_id', 'event_type']);
            $table->index(['user_id', 'event_type']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('video_events');
    }
};
