<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('coin_orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->foreignId('package_id')->constrained('coin_packages')->onDelete('restrict');
            $table->bigInteger('coins');
            $table->decimal('price_usd', 10, 2);
            $table->string('currency', 3)->default('USD');
            $table->string('payment_method', 50);
            $table->string('payment_status', 20)->default('pending');
            $table->string('payment_reference', 255)->nullable()->unique();
            $table->json('payment_meta')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'payment_status']);
            $table->index('payment_reference');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('coin_orders');
    }
};
