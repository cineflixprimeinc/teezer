<?php

use App\Models\AdminCoinSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Premium's monthly coin bonus.
 *
 * The grant ledger is what makes the drop idempotent. The scheduled command runs
 * daily and re-derives which periods a subscription is owed, so without a unique
 * key it would pay the same month over and over. `period` is the number of whole
 * months elapsed since the subscription started (0 = the month they bought it),
 * so the bonus lands on the subscription's anniversary day rather than on the
 * 1st - a user who subscribes on the 20th is paid on the 20th.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('premium_coin_grants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('subscription_id')->constrained()->cascadeOnDelete();
            // 0-indexed month of the subscription this grant pays for.
            $table->unsignedInteger('period');
            $table->unsignedInteger('coins');
            $table->timestamp('granted_at');
            $table->timestamps();

            // The whole point: one grant per subscription per month. A concurrent
            // second run loses the insert race instead of double-paying.
            $table->unique(['subscription_id', 'period']);
            $table->index(['user_id', 'granted_at']);
        });

        AdminCoinSetting::updateOrCreate(
            ['key' => 'premium_bonus_coins'],
            ['value' => '200', 'description' => 'Coins granted to a Premium member each month'],
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('premium_coin_grants');
        AdminCoinSetting::where('key', 'premium_bonus_coins')->delete();
    }
};
