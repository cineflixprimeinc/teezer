<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('music_usage', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('track_id');
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('content_id')->nullable();
            $table->string('content_type', 20)->nullable(); // reel, video, story, photo
            $table->timestamp('used_at')->useCurrent();

            $table->foreign('track_id')->references('id')->on('music_tracks')->cascadeOnDelete();
            $table->index(['track_id', 'user_id']);
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('music_usage');
    }
};
