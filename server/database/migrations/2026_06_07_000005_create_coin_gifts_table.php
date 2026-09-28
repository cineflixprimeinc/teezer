<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('coin_gifts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sender_id')->constrained('users')->onDelete('cascade');
            $table->foreignId('receiver_id')->constrained('users')->onDelete('cascade');
            $table->unsignedBigInteger('video_id')->nullable();
            $table->unsignedBigInteger('live_id')->nullable();
            $table->string('gift_name', 100)->default('Gift');
            $table->bigInteger('gross_coins');
            $table->decimal('commission_rate', 5, 2)->default(30.00);
            $table->bigInteger('commission_coins');
            $table->bigInteger('net_coins');
            $table->decimal('gross_value_usd', 10, 2);
            $table->decimal('net_value_usd', 10, 2);
            $table->decimal('platform_revenue_usd', 10, 2);
            $table->string('status', 20)->default('completed');
            $table->string('reference_id', 100)->unique()->nullable();
            $table->timestamps();

            $table->index(['sender_id', 'created_at']);
            $table->index(['receiver_id', 'created_at']);
            $table->index('reference_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('coin_gifts');
    }
};
