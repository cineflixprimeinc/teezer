<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('followers', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('follower_id');
            $table->unsignedBigInteger('following_id');
            $table->timestamp('created_at')->useCurrent();

            $table->foreign('follower_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('following_id')->references('id')->on('users')->cascadeOnDelete();
            $table->unique(['follower_id', 'following_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('followers');
    }
};
