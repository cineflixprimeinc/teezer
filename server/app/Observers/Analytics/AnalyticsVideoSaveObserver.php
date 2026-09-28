<?php

namespace App\Observers\Analytics;

/** save / unsave. */
class AnalyticsVideoSaveObserver extends AnalyticsEngagementObserver
{
    protected function type(): string
    {
        return 'save';
    }
}
