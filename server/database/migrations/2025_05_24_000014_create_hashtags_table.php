<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hashtags', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100)->unique();
            $table->unsignedInteger('videos_count')->default(0);
            $table->timestamps();
        });

        Schema::create('video_hashtags', function (Blueprint $table) {
            $table->id();
            $table->foreignId('video_id')->constrained()->cascadeOnDelete();
            $table->foreignId('hashtag_id')->constrained()->cascadeOnDelete();

            $table->unique(['video_id', 'hashtag_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('video_hashtags');
        Schema::dropIfExists('hashtags');
    }
};
