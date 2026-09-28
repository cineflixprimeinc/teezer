<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('video_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('video_id')->constrained()->cascadeOnDelete();
            $table->foreignId('reporter_id')->references('id')->on('users')->cascadeOnDelete();
            $table->enum('reason', ['spam', 'nudity', 'hate', 'misinformation', 'violence', 'copyright', 'other']);
            $table->text('description')->nullable();
            $table->enum('status', ['pending', 'reviewed', 'dismissed', 'actioned'])->default('pending');
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->foreign('reviewed_by')->references('id')->on('users')->nullOnDelete();
            $table->index('status');
            $table->index('video_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('video_reports');
    }
};
