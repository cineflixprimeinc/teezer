<?php

namespace App\Console\Commands;

use App\Services\Ads\EligibleAdPoolBuilder;
use Illuminate\Console\Command;

class BuildAdPools extends Command
{
    protected $signature = 'ads:build-pools';

    protected $description = 'Precompute eligible ad pools into Redis for the ad server.';

    public function handle(EligibleAdPoolBuilder $builder): int
    {
        $count = $builder->build();
        $this->info("Ad pools rebuilt · {$count} eligible candidates.");

        return self::SUCCESS;
    }
}
