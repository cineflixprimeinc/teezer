<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminActionLog;
use App\Models\LiveStream;
use App\Services\GlobalControls\GlobalControlRegistry;
use App\Services\GlobalControls\GlobalControlService;
use App\StreamHub\LiveStreamHubService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminGlobalControlsController extends Controller
{
    public function __construct(private readonly GlobalControlService $controls) {}

    /**
     * Category => the additional permission an editor needs beyond the
     * coarse `global_controls.edit` gate on the route. Mirrors the spec's own
     * nine permission keys - every category maps to one of them.
     */
    private const CATEGORY_PERMISSION = [
        GlobalControlRegistry::CATEGORY_AUTHENTICATION => 'global_controls.authentication',
        GlobalControlRegistry::CATEGORY_USER_ACTIVITY  => 'global_controls.social',
        GlobalControlRegistry::CATEGORY_CONTENT        => 'global_controls.content',
        GlobalControlRegistry::CATEGORY_LIVE_SPACES    => 'global_controls.live',
        GlobalControlRegistry::CATEGORY_MESSAGING      => 'global_controls.social',
        GlobalControlRegistry::CATEGORY_ACCOUNT        => 'global_controls.security',
        GlobalControlRegistry::CATEGORY_MONETIZATION   => 'global_controls.monetization',
        GlobalControlRegistry::CATEGORY_STUDIO         => 'global_controls.content',
        GlobalControlRegistry::CATEGORY_DISCOVERY      => 'global_controls.content',
        GlobalControlRegistry::CATEGORY_SAFETY         => 'global_controls.social',
        GlobalControlRegistry::CATEGORY_NOTIFICATIONS  => 'global_controls.social',
        GlobalControlRegistry::CATEGORY_EMERGENCY      => 'global_controls.emergency',
    ];

    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => [
                'controls'   => $this->controls->forAdmin(),
                'categories' => GlobalControlRegistry::categories(),
                'status'     => $this->controls->statusSummary(),
            ],
        ]);
    }

    public function update(Request $request, string $key): JsonResponse
    {
        if (! GlobalControlRegistry::isValidKey($key)) {
            return response()->json(['success' => false, 'message' => 'Unknown control.'], 404);
        }

        $meta = GlobalControlRegistry::schema()[$key];

        if (! $this->authorizedForCategory($request, $meta['category'])) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have permission to change this category of controls.',
                'code' => 'PERMISSION_DENIED',
            ], 403);
        }

        $validated = $request->validate([
            'enabled'  => ['required', 'boolean'],
            'reason'   => ['nullable', 'string', 'max:500'],
            'duration' => ['nullable', 'integer', 'min:1', 'max:43200'], // minutes, up to 30 days
        ]);

        try {
            $result = $this->controls->set(
                key: $key,
                enabled: (bool) $validated['enabled'],
                admin: $request->user(),
                reason: $validated['reason'] ?? null,
                durationMinutes: $validated['duration'] ?? null,
            );
        } catch (\InvalidArgumentException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Global control updated.',
            'data' => [
                ...$result,
                'propagation' => $this->propagationStatus(),
            ],
        ]);
    }

    public function bulkCategory(Request $request, string $category): JsonResponse
    {
        if (! array_key_exists($category, GlobalControlRegistry::categories())) {
            return response()->json(['success' => false, 'message' => 'Unknown category.'], 404);
        }

        if (! $this->authorizedForCategory($request, $category)) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have permission to change this category of controls.',
                'code' => 'PERMISSION_DENIED',
            ], 403);
        }

        $validated = $request->validate([
            'enabled' => ['required', 'boolean'],
            'reason'  => ['nullable', 'string', 'max:500'],
        ]);

        $changed = $this->controls->setCategory($category, (bool) $validated['enabled'], $request->user(), $validated['reason'] ?? null);

        return response()->json([
            'success' => true,
            'message' => count($changed) . ' controls updated.',
            'data' => ['changed' => $changed, 'propagation' => $this->propagationStatus()],
        ]);
    }

    /** Recent Global Teezer Control activity, for the "View Activity" panel. */
    public function activity(Request $request): JsonResponse
    {
        $entries = AdminActionLog::where('category', 'global_controls')
            ->with('admin:id,name,username')
            ->latest('created_at')
            ->limit((int) $request->get('limit', 30))
            ->get()
            ->map(fn (AdminActionLog $log) => [
                'id' => $log->id,
                'action' => $log->action,
                'description' => $log->description,
                'metadata' => $log->metadata,
                'severity' => $log->severity,
                'admin' => $log->admin?->name ?? 'System',
                'createdAt' => $log->created_at?->toIso8601String(),
            ]);

        return response()->json(['success' => true, 'data' => $entries]);
    }

    /**
     * Quick Action: stop every currently-active live stream. Real action, not
     * just a display switch - ends each stream through the same LiveKit path
     * StudioLiveController::end() uses, then logs every stream ended.
     */
    public function stopActiveLiveStreams(Request $request, LiveStreamHubService $hub): JsonResponse
    {
        if (! $request->user()->hasAdminGrant('global_controls.emergency')) {
            return response()->json(['success' => false, 'message' => 'You do not have permission for this action.', 'code' => 'PERMISSION_DENIED'], 403);
        }

        $request->validate(['reason' => ['nullable', 'string', 'max:500']]);

        $streams = LiveStream::where('status', LiveStream::STATUS_LIVE)->get();
        $ended = [];

        foreach ($streams as $stream) {
            try {
                // Mirrors StudioLiveController::end() exactly - same field
                // updates, same viewer-session close, same event record -
                // so an admin-stopped stream looks identical downstream to
                // one the broadcaster ended themselves.
                $stream->forceFill([
                    'status'      => LiveStream::STATUS_ENDED,
                    'ended_at'    => now(),
                    'viewers_now' => 0,
                ])->save();
                $stream->viewers()->whereNull('left_at')->update(['left_at' => now()]);
                $hub->endRoom($stream);
                $stream->recordEvent('ended', $request->user()->id);
                $ended[] = $stream->id;
            } catch (\Throwable $e) {
                report($e);
            }
        }

        AdminActionLog::record(
            admin: $request->user(),
            action: 'global_control.stop_active_live_streams',
            category: 'global_controls',
            description: 'Stopped ' . count($ended) . ' active live stream(s).',
            metadata: ['stream_ids' => $ended, 'reason' => $request->get('reason')],
            severity: 'warning',
        );

        return response()->json(['success' => true, 'message' => count($ended) . ' live stream(s) stopped.', 'data' => ['stopped' => $ended]]);
    }

    private function authorizedForCategory(Request $request, string $category): bool
    {
        $user = $request->user();
        $permission = self::CATEGORY_PERMISSION[$category] ?? null;

        return $user->hasAdminGrant('global_controls.edit')
            && ($permission === null || $user->hasAdminGrant($permission));
    }

    /**
     * Honest propagation status (spec §36: never claim success that hasn't
     * happened). DB write and cache invalidation are synchronous and really
     * are done by the time this returns. There is no realtime config-push
     * channel in this codebase, so Website/Android/iOS are reported as
     * "next request" rather than falsely claimed instant - backend
     * enforcement itself (the part that actually guarantees the
     * restriction) is instant regardless, since every request re-checks the
     * live value.
     */
    private function propagationStatus(): array
    {
        return [
            'database' => 'applied',
            'cache' => 'invalidated',
            'backendEnforcement' => 'active',
            'clientConfig' => 'next request (no realtime push channel wired to config)',
        ];
    }
}
