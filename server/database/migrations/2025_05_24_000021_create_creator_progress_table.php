<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('creator_progress', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('current_level_id')->default(1);
            $table->unsignedInteger('current_xp')->default(0);
            $table->unsignedInteger('total_xp_earned')->default(0);
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

            $table->foreign('current_level_id')->references('id')->on('creator_levels');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('creator_progress');
    }
};
