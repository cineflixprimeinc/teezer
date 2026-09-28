<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admin_action_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('admin_id')->constrained('users')->cascadeOnDelete();
            $table->string('action', 100);               // e.g. "ban_user", "remove_video"
            $table->string('category', 50);              // "user_management", "content_actions", etc.
            $table->string('target_type', 50)->nullable(); // "user", "video", "comment", "report"
            $table->unsignedBigInteger('target_id')->nullable();
            $table->text('description')->nullable();
            $table->json('metadata')->nullable();        // before/after state, extra context
            $table->string('ip_address', 45)->nullable();
            $table->string('severity', 20)->default('info'); // critical, high, medium, info
            $table->timestamp('created_at')->useCurrent();

            $table->index('admin_id');
            $table->index('action');
            $table->index('category');
            $table->index(['target_type', 'target_id']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_action_logs');
    }
};
