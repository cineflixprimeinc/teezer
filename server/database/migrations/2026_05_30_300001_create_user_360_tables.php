<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Per-user moderation controls
        if (!Schema::hasTable('user_moderation_settings')) {
            Schema::create('user_moderation_settings', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
                $table->boolean('restrict_uploads')->default(false);
                $table->boolean('post_approval_required')->default(false);
                $table->boolean('block_live_access')->default(false);
                $table->boolean('disable_drafts')->default(false);
                $table->boolean('disable_commenting')->default(false);
                $table->unsignedSmallInteger('daily_upload_limit')->nullable();
                $table->boolean('nsfw_review_required')->default(false);
                $table->boolean('copyright_hold')->default(false);
                $table->timestamp('upload_suspension_until')->nullable();
                $table->boolean('shadowban')->default(false);
                $table->boolean('temporary_suspension')->default(false);
                $table->unsignedTinyInteger('warning_level')->default(0);
                $table->string('content_review_mode', 20)->default('standard');
                $table->string('comment_moderation', 20)->default('standard');
                $table->boolean('message_monitoring')->default(false);
                $table->unsignedTinyInteger('strike_count')->default(0);
                $table->timestamp('last_warning_at')->nullable();
                $table->timestamp('last_strike_at')->nullable();
                $table->timestamp('last_appeal_at')->nullable();
                $table->string('appeal_status', 20)->nullable();
                $table->timestamps();
            });
        }

        // Per-user permission overrides
        if (!Schema::hasTable('user_permission_settings')) {
            Schema::create('user_permission_settings', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
                $table->boolean('live_permission')->default(true);
                $table->boolean('duet_permission')->default(true);
                $table->boolean('download_permission')->default(true);
                $table->boolean('collaboration_permission')->default(true);
                $table->string('messaging_permission', 20)->default('everyone');
                $table->string('access_level', 20)->default('full');
                $table->timestamps();
            });
        }

        // Admin notes per user
        if (!Schema::hasTable('admin_user_notes')) {
            Schema::create('admin_user_notes', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->foreignId('admin_id')->constrained('users')->cascadeOnDelete();
                $table->text('note');
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_user_notes');
        Schema::dropIfExists('user_permission_settings');
        Schema::dropIfExists('user_moderation_settings');
    }
};
