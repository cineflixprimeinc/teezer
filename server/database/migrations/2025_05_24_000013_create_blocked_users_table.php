<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('blocked_users', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('blocker_id');
            $table->unsignedBigInteger('blocked_id');
            $table->timestamp('created_at')->useCurrent();

            $table->foreign('blocker_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('blocked_id')->references('id')->on('users')->cascadeOnDelete();
            $table->unique(['blocker_id', 'blocked_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('blocked_users');
    }
};
