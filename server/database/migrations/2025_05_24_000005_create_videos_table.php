<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('videos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('title', 255)->nullable();
            $table->text('caption')->nullable();
            $table->string('video_url', 500);
            $table->string('thumbnail_url', 500)->nullable();
            $table->unsignedSmallInteger('duration')->nullable();
            $table->unsignedBigInteger('file_size')->nullable();
            $table->unsignedSmallInteger('width')->nullable();
            $table->unsignedSmallInteger('height')->nullable();
            $table->foreignId('audio_track_id')->nullable()->nullOnDelete();
            $table->string('custom_audio_name', 255)->nullable();
            $table->enum('status', ['draft', 'scheduled', 'published', 'private', 'removed'])->default('published');
            $table->timestamp('scheduled_at')->nullable();
            $table->boolean('allow_comments')->default(true);
            $table->boolean('allow_duet')->default(true);
            $table->boolean('allow_stitch')->default(true);
            $table->unsignedBigInteger('views_count')->default(0);
            $table->unsignedBigInteger('likes_count')->default(0);
            $table->unsignedInteger('comments_count')->default(0);
            $table->unsignedInteger('saves_count')->default(0);
            $table->unsignedInteger('shares_count')->default(0);
            $table->boolean('is_flagged')->default(false);
            $table->timestamps();
            $table->softDeletes();

            $table->index('user_id');
            $table->index('status');
            $table->index(['created_at']);
            $table->index('is_flagged');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('videos');
    }
};
