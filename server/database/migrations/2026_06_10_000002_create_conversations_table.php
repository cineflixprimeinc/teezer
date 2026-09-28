<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('conversations', function (Blueprint $table) {
            $table->id();
            // Canonical ordering: user_a_id < user_b_id - ensures one row per pair
            $table->unsignedBigInteger('user_a_id');
            $table->unsignedBigInteger('user_b_id');
            $table->unsignedBigInteger('initiated_by'); // who sent the first message / follow request
            $table->unsignedBigInteger('received_by');  // who receives it
            $table->enum('status', ['approved', 'pending_request', 'rejected', 'blocked'])
                  ->default('approved');
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();

            $table->unique(['user_a_id', 'user_b_id']);
            $table->foreign('user_a_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('user_b_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('initiated_by')->references('id')->on('users')->cascadeOnDelete();
            $table->index('received_by');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('conversations');
    }
};
