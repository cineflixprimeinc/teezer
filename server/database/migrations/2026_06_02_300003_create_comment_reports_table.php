<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('comment_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('comment_id')->constrained('video_comments')->cascadeOnDelete();
            $table->unsignedBigInteger('video_id');
            $table->foreignId('reporter_user_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedBigInteger('comment_owner_id');
            $table->string('reason');
            $table->text('details')->nullable();
            $table->enum('status', ['pending', 'reviewed', 'resolved', 'rejected'])->default('pending');
            $table->timestamp('reviewed_at')->nullable();
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->timestamps();

            $table->index(['comment_id', 'reporter_user_id']);
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('comment_reports');
    }
};
