<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('video_views', function (Blueprint $table) {
            $table->id();
            $table->foreignId('video_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->nullOnDelete();
            $table->string('ip_address', 45)->nullable();
            $table->unsignedSmallInteger('watch_duration')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index('video_id');
            $table->index(['video_id', 'user_id']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('video_views');
    }
};
