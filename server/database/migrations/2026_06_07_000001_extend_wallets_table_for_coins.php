<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('wallets', function (Blueprint $table) {
            $table->bigInteger('bonus_coin_balance')->default(0)->after('coins_balance');
            $table->bigInteger('earned_coin_balance')->default(0)->after('bonus_coin_balance');
            $table->decimal('wallet_balance_usd', 12, 2)->default(0.00)->after('earned_coin_balance');
            $table->decimal('pending_balance_usd', 12, 2)->default(0.00)->after('wallet_balance_usd');
            $table->bigInteger('total_received_coins')->default(0)->after('pending_balance_usd');
            $table->bigInteger('total_commission_coins')->default(0)->after('total_received_coins');
            $table->bigInteger('total_net_earned_coins')->default(0)->after('total_commission_coins');
            $table->bigInteger('total_spent_coins')->default(0)->after('total_net_earned_coins');
            $table->bigInteger('total_purchased_coins')->default(0)->after('total_spent_coins');
        });
    }

    public function down(): void
    {
        Schema::table('wallets', function (Blueprint $table) {
            $table->dropColumn([
                'bonus_coin_balance', 'earned_coin_balance', 'wallet_balance_usd',
                'pending_balance_usd', 'total_received_coins', 'total_commission_coins',
                'total_net_earned_coins', 'total_spent_coins', 'total_purchased_coins',
            ]);
        });
    }
};
