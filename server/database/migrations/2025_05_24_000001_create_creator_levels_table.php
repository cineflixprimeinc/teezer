<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('creator_levels', function (Blueprint $table) {
            $table->unsignedTinyInteger('id')->primary();
            $table->string('level_name', 100);
            $table->unsignedInteger('min_xp');
            $table->unsignedInteger('max_xp')->nullable();
            $table->string('badge_color', 7)->nullable();
            $table->string('icon_url', 500)->nullable();
            $table->json('perks')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('creator_levels');
    }
};
