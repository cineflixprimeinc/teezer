<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wallets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->decimal('balance', 12, 2)->default(0.00);
            $table->unsignedBigInteger('coins_balance')->default(0);
            $table->decimal('gift_earnings', 12, 2)->default(0.00);
            $table->decimal('subscription_earnings', 12, 2)->default(0.00);
            $table->decimal('ad_earnings', 12, 2)->default(0.00);
            $table->decimal('total_withdrawn', 12, 2)->default(0.00);
            $table->timestamps();
        });

        Schema::create('wallet_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_id')->constrained()->cascadeOnDelete();
            $table->enum('type', ['credit', 'debit', 'withdrawal', 'gift_received', 'subscription_income', 'ad_income']);
            $table->decimal('amount', 10, 2);
            $table->string('description', 255)->nullable();
            $table->string('reference_id', 100)->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wallet_transactions');
        Schema::dropIfExists('wallets');
    }
};
