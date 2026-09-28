<?php

namespace App\Observers;

use App\Jobs\SyncCreatorMonetization;
use App\Models\User;

/**
 * Re-measure a creator's monetization standing when something on their USER
 * row that feeds a requirement changes.
 *
 * An observer rather than a call in each controller on purpose: `is_banned` is
 * written from at least three admin paths and `is_verified` from two, and a
 * suspension that failed to withdraw earning access because someone edited the
 * wrong controller is exactly the bug this design has to make impossible.
 *
 * Only the fields that actually feed a requirement are watched, so an avatar
 * change does not queue a job.
 */
class UserMonetizationObserver
{
    /** User columns that appear in MonetizationEligibilityService::metrics(). */
    private const WATCHED = [
        'is_banned',          // Community Guidelines - dynamic, suspends access
        'is_verified',        // Identity verified
        'email_verified_at',  // Email or phone verified
        'phone',
        'bio',                // Profile complete
        'avatar',
    ];

    public function updated(User $user): void
    {
        foreach (self::WATCHED as $field) {
            if ($user->wasChanged($field)) {
                SyncCreatorMonetization::dispatch($user->id);
                return;
            }
        }
    }
}
