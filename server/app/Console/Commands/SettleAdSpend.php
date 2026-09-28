<?php

namespace App\Console\Commands;

use App\Services\Ads\AdBillingService;
use Illuminate\Console\Command;

class SettleAdSpend extends Command
{
    protected $signature = 'ads:settle';

    protected $description = 'Reconcile buffered ad spend into the ledger, balances and budgets.';

    public function handle(AdBillingService $billing): int
    {
        $count = $billing->settle();
        $this->info("Settled ad spend for {$count} campaign(s).");

        return self::SUCCESS;
    }
}
