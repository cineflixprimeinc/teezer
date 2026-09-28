<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gifts', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);
            $table->string('icon_url', 500)->nullable();
            $table->unsignedInteger('coin_value');
            $table->decimal('cash_value', 8, 4);
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('gift_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('gift_id')->constrained();
            $table->unsignedBigInteger('sender_id');
            $table->unsignedBigInteger('receiver_id');
            $table->foreignId('video_id')->nullable()->nullOnDelete();
            $table->unsignedInteger('quantity')->default(1);
            $table->unsignedInteger('total_coins');
            $table->timestamp('created_at')->useCurrent();

            $table->foreign('sender_id')->references('id')->on('users');
            $table->foreign('receiver_id')->references('id')->on('users');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gift_transactions');
        Schema::dropIfExists('gifts');
    }
};
