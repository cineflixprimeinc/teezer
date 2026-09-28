<?php

namespace App\Services;

use App\Mail\MonetizationAvailableMail;
use App\Models\MonetizationProgram;
use App\Models\ProgramWaitlistSignup;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Tells the people who asked to be told.
 *
 * program_waitlist_signups was write-only. "Notify When Available" created a
 * row, the row satisfied the unique index that stops duplicate signups, and
 * then nothing ever read it - so the promise the button makes was never kept.
 * This is the missing half.
 *
 * Eligibility is re-checked per user rather than assumed from the program being
 * switched on. A program becoming available does NOT make everyone on its
 * waitlist eligible for it: countries, account age, follower thresholds and
 * payout setup are all per-user, and MonetizationEligibilityService already
 * knows how to answer that. Announcing availability to someone who would still
 * be refused is worse than staying quiet.
 *
 * Sending is idempotent through notified_at: a row is stamped as it is
 * announced, and only un-stamped rows are ever selected, so re-running this -
 * by an admin toggling a program twice, or a retry - cannot send twice.
 */
class ProgramWaitlistNotifier
{
    public function __construct(
        private readonly MonetizationEligibilityService $eligibility,
        private readonly NotificationService $notifications,
    ) {}

    /**
     * Announce `$program` to everyone waiting who can now actually use it.
     *
     * @return array{considered:int, notified:int, skipped:int}
     */
    public function run(MonetizationProgram $program): array
    {
        $considered = 0;
        $notified   = 0;
        $skipped    = 0;

        ProgramWaitlistSignup::query()
            ->where('program_key', $program->key)
            ->awaitingNotice()
            ->with('user')
            // Chunked by id: this can be a long list, and loading it whole
            // would hold every waiting user in memory at once.
            ->chunkById(200, function ($signups) use ($program, &$considered, &$notified, &$skipped) {
                foreach ($signups as $signup) {
                    $considered++;
                    $user = $signup->user;

                    // A deleted account, or one that cannot use the program
                    // yet, is left on the list rather than stamped - so it is
                    // reconsidered the next time this runs, when their own
                    // eligibility may have changed.
                    if (! $user || ! $this->eligibility->canUse($user, $program->key)) {
                        $skipped++;
                        continue;
                    }

                    $this->announce($user, $program);

                    // Stamped only after the announcement, so a failure part
                    // way through leaves the row to be retried rather than
                    // silently marking it done.
                    $signup->forceFill(['notified_at' => now()])->save();
                    $notified++;
                }
            });

        return ['considered' => $considered, 'notified' => $notified, 'skipped' => $skipped];
    }

    /**
     * In-app first, then email. The in-app card is the one that cannot fail
     * for reasons outside our control, so it is written before the mail queue
     * is involved.
     */
    private function announce(User $user, MonetizationProgram $program): void
    {
        try {
            $this->notifications->notify($user, 'monetization_available', [
                'program_key'   => $program->key,
                'program_label' => $program->label,
            ]);
        } catch (\Throwable $e) {
            // An announcement that cannot be delivered must not stop the rest
            // of the waitlist from being told.
            report($e);
        }

        if (! filter_var((string) $user->email, FILTER_VALIDATE_EMAIL)) {
            // Social sign-ups can carry a synthesized placeholder address
            // (see ApiAuthController::placeholderEmail) - never mail those.
            return;
        }

        if (! app(\App\Services\GlobalControls\GlobalControlService::class)->isEnabled('email_notifications_enabled')) {
            return;
        }

        try {
            Mail::to($user->email)->queue(new MonetizationAvailableMail($user, $program));
        } catch (\Throwable $e) {
            Log::warning('waitlist mail failed', [
                'user_id' => $user->id,
                'program' => $program->key,
                'error'   => $e->getMessage(),
            ]);
        }
    }
}
