<?php

namespace App\Observers\Analytics;

/**
 * share.
 *
 * A share cannot be un-shared - VideoShare rows are only ever created. Returning
 * null suppresses the undo rather than inventing an 'unshare' event type that the
 * rollups would have to carry and nothing would ever emit.
 */
class AnalyticsVideoShareObserver extends AnalyticsEngagementObserver
{
    protected function type(): string
    {
        return 'share';
    }

    protected function undoType(): ?string
    {
        return null;
    }
}
