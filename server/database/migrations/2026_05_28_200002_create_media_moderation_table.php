<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('media_moderation', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('content_id');
            $table->unsignedBigInteger('user_id');
            $table->string('content_type', 50);    // video_post, profile_image, thumbnail, etc.
            $table->string('file_key', 500);

            // Scan lifecycle
            $table->enum('scan_status', ['queued', 'scanning', 'completed', 'failed'])
                  ->default('queued');

            // Detection results
            $table->boolean('nudity_detected')->default(false);
            $table->decimal('nudity_score', 5, 4)->default(0);
            $table->decimal('nsfw_score', 5, 4)->default(0);
            $table->json('detected_labels_json')->nullable();
            $table->unsignedSmallInteger('scanned_frames_count')->default(0);
            $table->decimal('highest_risk_timestamp', 8, 2)->nullable();

            // Decision
            $table->enum('decision', ['approved', 'pending_review', 'rejected'])->nullable();
            $table->text('reason')->nullable();

            // Model info
            $table->string('model_name', 100)->nullable();
            $table->string('model_version', 50)->nullable();
            $table->timestamp('scanned_at')->nullable();

            // Admin review
            $table->enum('admin_review_status', ['pending', 'approved', 'rejected'])->nullable();
            $table->unsignedBigInteger('admin_reviewed_by')->nullable();
            $table->timestamp('admin_reviewed_at')->nullable();

            $table->timestamps();

            $table->index(['content_id', 'content_type']);
            $table->index('user_id');
            $table->index('decision');
            $table->index('scan_status');
            $table->index('scanned_at');
            $table->foreign('admin_reviewed_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('media_moderation');
    }
};
