<?php

namespace App\Jobs;

use App\Models\User;
use App\Services\MonetizationEligibilityService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

/**
 * Re-measure one creator against every monetization programme.
 *
 * Dispatched whenever something that feeds a requirement changes: a video is
 * published or removed, a follower arrives or leaves, identity verification is
 * approved, or an account is banned or restored. A creator therefore unlocks a
 * programme within seconds of qualifying, and loses it within seconds of a
 * violation, without anyone approving anything.
 *
 * `ShouldBeUnique` with a short window collapses the storm: gaining fifty
 * followers in a minute is one evaluation, not fifty. The unique lock is keyed
 * on the user, so two different creators are never serialised behind each other.
 *
 * Losing this job is survivable by design. It only writes the SNAPSHOT - the
 * app and the website measure eligibility on every read, so a dropped job costs
 * a stale history row, never a creator's access.
 */
class SyncCreatorMonetization implements ShouldQueue, ShouldBeUnique
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** Long enough to absorb a burst, short enough to feel immediate. */
    public int $uniqueFor = 60;

    public int $tries = 3;

    public function __construct(public int $userId)
    {
    }

    public function uniqueId(): string
    {
        return (string) $this->userId;
    }

    public function handle(MonetizationEligibilityService $eligibility): void
    {
        $user = User::with('profile')->find($this->userId);
        if (! $user) {
            return;
        }

        $transitions = $eligibility->sync($user);

        // Worth a log line: these are the moments a creator gained or lost the
        // ability to earn, and the only record of why a balance started or
        // stopped growing.
        foreach ($transitions['unlocked'] as $key) {
            Log::info('monetization.unlocked', ['user_id' => $user->id, 'program' => $key]);
        }
        foreach ($transitions['suspended'] as $key) {
            Log::warning('monetization.suspended', ['user_id' => $user->id, 'program' => $key]);
        }
    }
}
