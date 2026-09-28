<?php

namespace App\Console\Commands;

use App\Models\MonetizationProgram;
use App\Services\ProgramWaitlistNotifier;
use Illuminate\Console\Command;

/**
 * Fulfils waitlist signups for people who became eligible on their own.
 *
 * The admin path (switching a program to `enabled`) announces immediately, but
 * that is only half of it: a program can already be open while a particular
 * user is still short of a follower count, a country rollout, or payout setup.
 * When they finally cross that line nobody toggles anything, so without this
 * their "Notify when available" request would sit unfulfilled forever.
 *
 * Safe to run as often as you like. Only un-notified rows are selected, each is
 * stamped as it is announced, and every user is eligibility-checked
 * individually - so a run with nothing to do sends nothing.
 */
class NotifyMonetizationWaitlists extends Command
{
    protected $signature = 'monetization:notify-waitlists {--program= : Limit to one programme key}';

    protected $description = 'Notify waitlisted users whose monetization programme is now available to them';

    public function handle(ProgramWaitlistNotifier $notifier): int
    {
        $programs = MonetizationProgram::query()
            ->where('mode', 'enabled')
            ->when($this->option('program'), fn ($q, $key) => $q->where('key', $key))
            ->get();

        if ($programs->isEmpty()) {
            $this->info('No enabled programmes to announce.');
            return self::SUCCESS;
        }

        $total = 0;
        foreach ($programs as $program) {
            $r = $notifier->run($program);
            $total += $r['notified'];
            $this->line(sprintf(
                '  %-22s considered %-5d notified %-5d still waiting %d',
                $program->key, $r['considered'], $r['notified'], $r['skipped'],
            ));
        }

        $this->info("Notified {$total} user(s).");
        return self::SUCCESS;
    }
}
