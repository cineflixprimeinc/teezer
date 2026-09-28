<?php

namespace App\Http\Controllers\Dashboard\Creator;

use App\Http\Controllers\Controller;
use Illuminate\View\View;

class CreatorDashboardController extends Controller
{
    public function index(): View
    {
        $user = auth()->user();

        // TODO Phase 7: pull real creator analytics
        $stats = [
            'total_views'       => 0,
            'watch_time_hours'  => 0,
            'new_followers'     => 0,
            'earnings'          => '0.00',
            'engagement_rate'   => '0.0',
        ];

        return view('dashboard.creator.index', compact('user', 'stats'));
    }
}
