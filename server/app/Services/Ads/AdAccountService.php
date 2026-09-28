<?php

namespace App\Services\Ads;

use App\Models\AdAccount;

/**
 * Resolves the ad account for a user. In self-serve mode every user is their own
 * account (created on first use); brand/agency accounts are supported by the schema
 * and can be added later without changing callers.
 */
class AdAccountService
{
    public function forUser(int $userId, string $currency = 'USD'): AdAccount
    {
        return AdAccount::firstOrCreate(
            ['user_id' => $userId],
            [
                'name'     => 'Self-serve',
                'type'     => 'self_serve',
                'status'   => 'active',
                'currency' => $currency,
            ]
        );
    }
}
