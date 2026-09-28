<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_reports', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('reported_user_id');
            $table->unsignedBigInteger('reporter_id');
            $table->enum('reason', ['spam', 'harassment', 'fake', 'hate', 'other']);
            $table->text('description')->nullable();
            $table->enum('status', ['pending', 'reviewed', 'dismissed', 'actioned'])->default('pending');
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->foreign('reported_user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('reporter_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('reviewed_by')->references('id')->on('users')->nullOnDelete();
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_reports');
    }
};
