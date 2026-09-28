<?php

namespace App\Observers\Analytics;

/**
 * comment / uncomment.
 *
 * VideoComment soft-deletes, so Eloquent fires `deleted` on the soft delete too -
 * which is exactly what we want: a removed comment should stop counting toward the
 * creator's engagement, whether the row is gone or merely flagged.
 */
class AnalyticsVideoCommentObserver extends AnalyticsEngagementObserver
{
    protected function type(): string
    {
        return 'comment';
    }

    protected function undoType(): ?string
    {
        return 'uncomment';
    }
}
