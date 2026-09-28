<?php

namespace App\Services;

use App\Models\User;
use App\Models\CreatorAnalytic;

class AnalyticsService
{
    public function recordView(User $creator, int $watchDuration): void
    {
        // Phase 5: upsert daily analytics row
    }

    public function recordLike(User $creator): void
    {
        // Phase 5: increment likes_received for today
    }

    public function getDashboardStats(User $creator): array
    {
        // Phase 5: aggregate last 30 days
        return [];
    }
}
