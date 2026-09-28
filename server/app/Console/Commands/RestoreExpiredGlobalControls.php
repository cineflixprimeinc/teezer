<?php

namespace App\Console\Commands;

use App\Services\GlobalControls\GlobalControlService;
use Illuminate\Console\Command;

/**
 * Restores every Global Reelsoo Control whose temporary-restriction window
 * (spec §28) has passed - sets `enabled` back to whatever it was before the
 * restriction, clears expires_at/restore_value, and logs the auto-restore.
 * Scheduled every five minutes in routes/console.php, alongside the sibling
 * `restrictions:expire` command this mirrors.
 */
class RestoreExpiredGlobalControls extends Command
{
    protected $signature = 'global-controls:restore-expired';
    protected $description = 'Restore Global Teezer Control toggles whose temporary restriction window has expired.';

    public function handle(GlobalControlService $controls): int
    {
        $count = $controls->restoreExpired();

        if ($count > 0) {
            $this->info("Restored {$count} expired global control(s).");
        }

        return self::SUCCESS;
    }
}
