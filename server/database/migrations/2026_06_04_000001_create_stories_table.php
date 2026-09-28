<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->text('caption')->nullable();
            $table->enum('visibility', ['everyone', 'followers', 'close_friends', 'only_me'])->default('everyone');
            $table->boolean('allow_replies')->default(true);
            $table->boolean('allow_resharing')->default(true);
            $table->boolean('save_to_archive')->default(true);
            $table->enum('status', ['draft', 'published', 'archived', 'expired'])->default('published');
            $table->string('location', 255)->nullable();
            $table->string('link', 500)->nullable();
            $table->json('tagged_users')->nullable();
            $table->json('stickers')->nullable();
            $table->unsignedBigInteger('music_id')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['user_id', 'status']);
            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stories');
    }
};
