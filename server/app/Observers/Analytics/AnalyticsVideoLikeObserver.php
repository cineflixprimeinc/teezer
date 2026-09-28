<?php

namespace App\Observers\Analytics;

/** like / unlike. The unlike carries delta = -1, so sum(delta) is the true net. */
class AnalyticsVideoLikeObserver extends AnalyticsEngagementObserver
{
    protected function type(): string
    {
        return 'like';
    }
}
