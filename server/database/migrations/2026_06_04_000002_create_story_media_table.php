<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('story_media', function (Blueprint $table) {
            $table->id();
            $table->foreignId('story_id')->constrained('stories')->cascadeOnDelete();
            $table->enum('media_type', ['image', 'video', 'text'])->default('image');
            $table->string('media_url', 500)->nullable();
            $table->string('thumbnail_url', 500)->nullable();
            $table->unsignedSmallInteger('duration_seconds')->nullable();
            $table->unsignedTinyInteger('order_index')->default(0);
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['story_id', 'order_index']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('story_media');
    }
};
