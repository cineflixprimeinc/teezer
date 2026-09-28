<?php

namespace App\Console\Commands;

use App\Services\ScreenTimeService;
use Illuminate\Console\Command;

/**
 * Aggregates the per-(user,day) Redis screen-time buffers into Postgres.
 * Scheduled every 5 minutes (routes/console.php). Keeps per-user DB writes off
 * the hot heartbeat path so tracking scales to millions of users.
 */
class FlushScreenTime extends Command
{
    protected $signature = 'screen-time:flush';
    protected $description = 'Flush buffered Redis screen-time deltas into Postgres';

    public function handle(ScreenTimeService $svc): int
    {
        $n = $svc->flush();
        $this->info("Flushed {$n} screen-time bucket(s).");
        return self::SUCCESS;
    }
}
