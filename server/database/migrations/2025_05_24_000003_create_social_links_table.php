<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('social_links', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->enum('platform', ['instagram', 'youtube', 'tiktok', 'telegram', 'whatsapp', 'twitter', 'website']);
            $table->string('url', 500);
            $table->tinyInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['user_id', 'platform']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('social_links');
    }
};
