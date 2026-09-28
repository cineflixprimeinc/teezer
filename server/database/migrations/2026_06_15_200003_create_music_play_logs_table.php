<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('music_play_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('track_id');
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('source', 30)->nullable(); // admin, studio, upload_picker, feed
            $table->timestamp('played_at')->useCurrent();

            $table->foreign('track_id')->references('id')->on('music_tracks')->cascadeOnDelete();
            $table->index(['track_id', 'played_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('music_play_logs');
    }
};
