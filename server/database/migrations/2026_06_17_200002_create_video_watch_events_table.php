<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('video_watch_events', function (Blueprint $table) {
            $table->id();
            $table->string('session_id', 64)->index();
            $table->foreignId('video_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->nullOnDelete();
            $table->string('event_type', 30);
            $table->unsignedSmallInteger('current_time')->default(0);
            $table->unsignedTinyInteger('watched_delta')->default(0);
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('video_watch_events');
    }
};
