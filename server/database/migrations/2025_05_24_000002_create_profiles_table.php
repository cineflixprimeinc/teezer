<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('location', 255)->nullable();
            $table->string('website', 500)->nullable();
            $table->string('joined_label', 50)->nullable();
            $table->string('category', 100)->nullable();
            $table->string('creator_badge', 50)->nullable();
            $table->unsignedInteger('total_followers')->default(0);
            $table->unsignedInteger('total_following')->default(0);
            $table->unsignedBigInteger('total_likes')->default(0);
            $table->unsignedInteger('total_videos')->default(0);
            $table->unsignedBigInteger('profile_views')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('profiles');
    }
};
