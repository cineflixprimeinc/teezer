<?php

namespace App\Console\Commands;

use App\Models\CreatorProgramStatus;
use App\Models\MonetizationProgram;
use App\Models\User;
use App\Services\MonetizationEligibilityService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * The monthly half of the ongoing conditions.
 *
 * Live metrics answer "are they eligible now" and have no memory of last month.
 * These rules need one: two consecutive failed months removes enrolment. So
 * once a month this records a verdict per creator per programme, and acts on
 * the run of them.
 *
 * Keyed on the month, so running twice in the same month is a no-op rather than
 * a second strike against a creator who did nothing wrong.
 */
class MonetizationMonthlyReview extends Command
{
    protected $signature = 'monetization:monthly-review
                            {--dry : Report what would change without writing}';

    protected $description = 'Record monthly eligibility and remove enrolment after two consecutive failed months';

    /** The spec's threshold, and how long removal lasts. */
    private const FAIL_LIMIT   = 2;
    private const REMOVAL_DAYS = 180;

    public function handle(MonetizationEligibilityService $eligibility): int
    {
        $monthKey = now()->subMonthNoOverflow()->format('Y-m');   // the month just ended
        $dry = (bool) $this->option('dry');

        $this->info("Monthly review for {$monthKey}" . ($dry ? ' (dry run)' : ''));

        $programs = MonetizationProgram::allCached();
        $removed = 0; $recovered = 0; $checked = 0;

        // Only creators who already have standing recorded - a user who has
        // never been evaluated has no run of months to judge.
        CreatorProgramStatus::select('user_id')->distinct()
            ->chunkById(200, function ($rows) use ($eligibility, $programs, $monthKey, $dry, &$removed, &$recovered, &$checked) {
                foreach ($rows as $row) {
                    $user = User::with('profile')->find($row->user_id);
                    if (! $user) continue;

                    $metrics = $eligibility->metrics($user);

                    foreach ($programs as $program) {
                        $status = CreatorProgramStatus::where('user_id', $user->id)
                            ->where('program_key', $program->key)->first();
                        if (! $status) continue;

                        // Already judged this month: do not count it twice.
                        if ($status->last_month_key === $monthKey) continue;

                        $eval = $eligibility->evaluateProgram($program, $metrics, $user->id);
                        $checked++;

                        if ($eval['all_met']) {
                            // A good month clears the run entirely - the rule is
                            // CONSECUTIVE failures, not lifetime ones.
                            if ($status->consecutive_failed_months > 0) $recovered++;
                            $status->consecutive_failed_months = 0;
                        } else {
                            $status->consecutive_failed_months++;

                            if ($status->consecutive_failed_months >= self::FAIL_LIMIT
                                && ! $status->enrolment_removed_at) {
                                $status->enrolment_removed_at = now();
                                $status->reenrol_after = now()->addDays(self::REMOVAL_DAYS);
                                $removed++;

                                Log::warning('monetization.enrolment_removed', [
                                    'user_id' => $user->id,
                                    'program' => $program->key,
                                    'failed_months' => $status->consecutive_failed_months,
                                ]);
                            }
                        }

                        $status->last_month_key = $monthKey;
                        if (! $dry) $status->save();
                    }
                }
            }, 'user_id');

        $this->info("checked={$checked} removed={$removed} recovered={$recovered}");

        return self::SUCCESS;
    }
}
