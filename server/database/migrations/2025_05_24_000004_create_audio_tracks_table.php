<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audio_tracks', function (Blueprint $table) {
            $table->id();
            $table->string('title', 255);
            $table->string('artist', 255)->nullable();
            $table->string('cover_url', 500)->nullable();
            $table->string('audio_url', 500);
            $table->unsignedSmallInteger('duration')->nullable();
            $table->unsignedInteger('usage_count')->default(0);
            $table->boolean('is_original')->default(false);
            $table->foreignId('user_id')->nullable()->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audio_tracks');
    }
};
