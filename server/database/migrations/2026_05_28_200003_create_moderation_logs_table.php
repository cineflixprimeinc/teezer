<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('moderation_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('content_id');
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('action_type', 50);   // scan_completed, admin_approved, admin_rejected, admin_removed, rescan_requested
            $table->string('old_decision', 30)->nullable();
            $table->string('new_decision', 30)->nullable();
            $table->unsignedBigInteger('admin_id')->nullable();
            $table->text('reason')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index('content_id');
            $table->index('admin_id');
            $table->index('action_type');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('moderation_logs');
    }
};
