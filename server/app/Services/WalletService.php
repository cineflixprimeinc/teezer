<?php

namespace App\Services;

use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;

class WalletService
{
    public function credit(User $user, float $amount, string $type, string $description = ''): WalletTransaction
    {
        // Phase 6: credit coins to wallet, record transaction
        return new WalletTransaction();
    }

    public function debit(User $user, float $amount, string $type, string $description = ''): WalletTransaction
    {
        // Phase 6: debit coins from wallet with balance check
        return new WalletTransaction();
    }

    public function getOrCreateWallet(User $user): Wallet
    {
        return Wallet::firstOrCreate(
            ['user_id' => $user->id],
            ['balance' => 0, 'coins_balance' => 0],
        );
    }
}
