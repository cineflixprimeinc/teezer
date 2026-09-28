<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ScreenTimeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Screen Time API - thin controller over ScreenTimeService. All routes are
 * authenticated (auth:sanctum). Heartbeats buffer active-usage deltas; reads
 * merge the persisted rollup with the live Redis buffer.
 */
class ScreenTimeController extends Controller
{
    public function __construct(private readonly ScreenTimeService $svc) {}

    public function heartbeat(Request $request): JsonResponse
    {
        $data = $request->validate([
            'seconds'                 => ['required', 'integer', 'min:0', 'max:3600'],
            'breakdown'               => ['sometimes', 'array'],
            'breakdown.*'             => ['integer', 'min:0'],
            'longest_session_seconds' => ['sometimes', 'integer', 'min:0'],
            'device'                  => ['sometimes', 'string', 'max:20'],
        ]);

        $total = $this->svc->heartbeat(
            $request->user(),
            (int) $data['seconds'],
            $data['breakdown'] ?? [],
            (int) ($data['longest_session_seconds'] ?? 0),
            $data['device'] ?? null,
        );

        return response()->json(['success' => true, 'data' => ['total_seconds' => $total]]);
    }

    public function today(Request $request): JsonResponse
    {
        return response()->json(['success' => true, 'data' => $this->svc->today($request->user())]);
    }

    public function summary(Request $request): JsonResponse
    {
        return response()->json(['success' => true, 'data' => $this->svc->summary($request->user())]);
    }

    public function graph(Request $request): JsonResponse
    {
        return response()->json(['success' => true, 'data' => $this->svc->graph($request->user(), (int) $request->integer('range', 7))]);
    }

    public function limits(Request $request): JsonResponse
    {
        return response()->json(['success' => true, 'data' => $this->svc->limits($request->user())]);
    }

    public function updateLimits(Request $request): JsonResponse
    {
        $data = $request->validate([
            'goal_minutes'                  => ['sometimes', 'integer', 'min:15', 'max:1440'],
            'daily_limit_enabled'           => ['sometimes', 'boolean'],
            'daily_limit_minutes'           => ['sometimes', 'integer', 'min:5', 'max:1440'],
            'break_enabled'                 => ['sometimes', 'boolean'],
            'break_interval_minutes'        => ['sometimes', 'integer', 'min:5', 'max:600'],
            'bedtime_enabled'               => ['sometimes', 'boolean'],
            'bedtime_start'                 => ['sometimes', 'string', 'max:5'],
            'bedtime_end'                   => ['sometimes', 'string', 'max:5'],
            'bedtime_disable_feed'          => ['sometimes', 'boolean'],
            'bedtime_disable_live'          => ['sometimes', 'boolean'],
            'bedtime_disable_audio'         => ['sometimes', 'boolean'],
            'bedtime_disable_upload'        => ['sometimes', 'boolean'],
            'bedtime_mute_notifications'    => ['sometimes', 'boolean'],
            'focus_hide_notifications'      => ['sometimes', 'boolean'],
            'focus_disable_infinite_scroll' => ['sometimes', 'boolean'],
            'focus_disable_autoplay'        => ['sometimes', 'boolean'],
            'focus_hide_recommended'        => ['sometimes', 'boolean'],
            'focus_pause_messages'          => ['sometimes', 'boolean'],
        ]);

        return response()->json(['success' => true, 'data' => $this->svc->updateLimits($request->user(), $data)]);
    }

    public function weekly(Request $request): JsonResponse
    {
        return response()->json(['success' => true, 'data' => $this->svc->weekly($request->user())]);
    }

    public function monthly(Request $request): JsonResponse
    {
        return response()->json(['success' => true, 'data' => $this->svc->monthly($request->user())]);
    }
}
