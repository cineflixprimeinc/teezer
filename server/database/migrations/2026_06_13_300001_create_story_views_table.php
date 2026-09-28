<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('story_views', function (Blueprint $table) {
            $table->id();
            $table->foreignId('story_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('viewer_id');
            $table->foreign('viewer_id')->references('id')->on('users')->cascadeOnDelete();
            $table->timestamp('viewed_at')->useCurrent();
            $table->unique(['story_id', 'viewer_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('story_views');
    }
};
