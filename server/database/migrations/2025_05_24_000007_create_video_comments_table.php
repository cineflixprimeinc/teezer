<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('video_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('video_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('parent_id')->nullable()->references('id')->on('video_comments')->cascadeOnDelete();
            $table->text('body');
            $table->unsignedInteger('likes_count')->default(0);
            $table->boolean('is_pinned')->default(false);
            $table->boolean('is_hidden')->default(false);
            $table->timestamps();
            $table->softDeletes();

            $table->index('video_id');
            $table->index('parent_id');
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('video_comments');
    }
};
