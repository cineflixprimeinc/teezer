<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Jobs\ScanImageJob;
use App\Jobs\ScanVideoJob;
use App\Models\MediaModeration;
use App\Models\ModerationLog;
use App\Models\ModerationSettings;
use App\Models\User;
use App\Models\Video;
use App\Services\ModerationService;
use App\Services\SightengineService;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class AdminModerationController extends Controller
{
    public function __construct(
        private readonly ModerationService  $moderation,
        private readonly SightengineService $sightengine,
        private readonly StorageService     $storage,
    ) {}

    // ── List endpoints ────────────────────────────────────────────────

    /**
     * GET /api/v1/admin/moderation/pending
     */
    public function pending(Request $request): JsonResponse
    {
        return $this->listByDecision($request, 'pending_review');
    }

    /**
     * GET /api/v1/admin/moderation/approved
     */
    public function approved(Request $request): JsonResponse
    {
        return $this->listByDecision($request, 'approved');
    }

    /**
     * GET /api/v1/admin/moderation/rejected
     */
    public function rejected(Request $request): JsonResponse
    {
        return $this->listByDecision($request, 'rejected');
    }

    private function listByDecision(Request $request, string $decision): JsonResponse
    {
        $q = MediaModeration::query()
            ->with(['adminReviewer'])
            ->where('decision', $decision);

        if ($userId = $request->integer('user_id')) {
            $q->where('user_id', $userId);
        }
        if ($type = $request->input('content_type')) {
            $q->where('content_type', $type);
        }
        if ($from = $request->input('from')) {
            $q->whereDate('created_at', '>=', $from);
        }
        if ($to = $request->input('to')) {
            $q->whereDate('created_at', '<=', $to);
        }
        if ($minScore = $request->float('min_nsfw_score')) {
            $q->where('nsfw_score', '>=', $minScore);
        }

        $records = $q->latest()->paginate($request->integer('per_page', 20));

        $records->getCollection()->transform(fn ($rec) => $this->format($rec));

        return response()->json([
            'success' => true,
            'data'    => $records->items(),
            'meta'    => [
                'current_page' => $records->currentPage(),
                'last_page'    => $records->lastPage(),
                'total'        => $records->total(),
                'per_page'     => $records->perPage(),
            ],
        ]);
    }

    // ── Single record ─────────────────────────────────────────────────

    /**
     * GET /api/v1/admin/moderation/{contentId}
     */
    public function show(int $contentId): JsonResponse
    {
        $record = MediaModeration::where('content_id', $contentId)->latest()->firstOrFail();
        $video  = Video::withTrashed()->findOrFail($contentId);

        return response()->json([
            'success' => true,
            'data'    => array_merge($this->format($record), [
                'video' => [
                    'id'            => $video->id,
                    'caption'       => $video->caption,
                    'status'        => $video->status,
                    'mime_type'     => $video->mime_type,
                    'duration'      => $video->duration,
                    'created_at'    => $video->created_at?->toISOString(),
                    'preview_url'   => $this->safePreviewUrl($video->thumbnail_url ?? $video->video_url),
                    'user'          => [
                        'id'       => $video->user_id,
                        'username' => $video->user?->username,
                    ],
                ],
            ]),
        ]);
    }

    // ── Admin decision ────────────────────────────────────────────────

    /**
     * POST /api/v1/admin/moderation/{contentId}/decision
     * Body: { decision: "approved"|"rejected"|"removed", reason?: string }
     */
    public function decide(Request $request, int $contentId): JsonResponse
    {
        $request->validate([
            'decision' => ['required', 'in:approved,rejected,removed'],
            'reason'   => ['nullable', 'string', 'max:1000'],
        ]);

        $video  = Video::withTrashed()->findOrFail($contentId);
        $record = MediaModeration::where('content_id', $contentId)->latest()->firstOrFail();

        $this->moderation->adminDecide(
            $video,
            $record,
            $request->input('decision'),
            $request->user()->id,
            $request->input('reason'),
        );

        return response()->json(['success' => true, 'message' => 'Decision saved.']);
    }

    // ── Re-scan ───────────────────────────────────────────────────────

    /**
     * POST /api/v1/admin/moderation/{contentId}/rescan
     */
    public function rescan(Request $request, int $contentId): JsonResponse
    {
        $video = Video::withTrashed()->findOrFail($contentId);

        $video->update(['moderation_status' => 'pending']);

        $mime    = $video->mime_type ?? '';
        $isImage = in_array($mime, config('moderation.image_mimes', []));
        $isImage
            ? ScanImageJob::dispatch($video)->onQueue('moderation')
            : ScanVideoJob::dispatch($video->fresh())->onQueue('moderation');

        ModerationLog::create([
            'content_id'  => $video->id,
            'user_id'     => $video->user_id,
            'action_type' => 'rescan_requested',
            'admin_id'    => $request->user()->id,
            'reason'      => 'Admin-triggered re-scan',
        ]);

        return response()->json(['success' => true, 'message' => 'Re-scan queued.']);
    }

    // ── Settings ──────────────────────────────────────────────────────

    /**
     * GET /api/v1/admin/moderation/settings
     */
    public function settings(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => ModerationSettings::current(),
        ]);
    }

    /**
     * POST /api/v1/admin/moderation/settings
     */
    public function updateSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'nsfw_pending_threshold'                 => ['sometimes', 'numeric', 'min:0', 'max:1'],
            'nsfw_reject_threshold'                  => ['sometimes', 'numeric', 'min:0', 'max:1'],
            'nudity_pending_threshold'               => ['sometimes', 'numeric', 'min:0', 'max:1'],
            'nudity_reject_threshold'                => ['sometimes', 'numeric', 'min:0', 'max:1'],
            'video_default_frame_interval_seconds'   => ['sometimes', 'integer', 'min:1', 'max:30'],
            'video_default_scan_duration_seconds'    => ['sometimes', 'integer', 'min:10', 'max:3600'],
            'video_full_scan_frame_interval_seconds' => ['sometimes', 'integer', 'min:1', 'max:10'],
            'auto_reject_enabled'                    => ['sometimes', 'boolean'],
            'admin_review_required_for_high_risk'    => ['sometimes', 'boolean'],
            'moderation_enabled'                     => ['sometimes', 'boolean'],
        ]);

        $settings = ModerationSettings::current();
        $settings->update(array_merge($validated, ['updated_by' => $request->user()->id]));
        ModerationSettings::bust();

        return response()->json([
            'success' => true,
            'message' => 'Settings updated.',
            'data'    => $settings->fresh(),
        ]);
    }

    // ── Scanner health ────────────────────────────────────────────────

    /**
     * GET /api/v1/admin/moderation/scanner-health
     */
    public function scannerHealth(): JsonResponse
    {
        try {
            $resp = \Illuminate\Support\Facades\Http::timeout(5)
                ->get(rtrim(config('moderation.scanner_url'), '/') . '/health');

            return response()->json([
                'success'  => true,
                'data'     => $resp->json(),
                'reachable'=> $resp->successful(),
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success'  => false,
                'reachable'=> false,
                'error'    => $e->getMessage(),
            ]);
        }
    }

    // ── Sightengine ───────────────────────────────────────────────────

    /**
     * POST /api/v1/admin/moderation/sightengine-test
     * Verify Sightengine credentials by running a dummy check.
     */
    public function sightengineTest(): JsonResponse
    {
        $result = $this->sightengine->testConnection();
        return response()->json([
            'success' => $result['ok'],
            'message' => $result['message'],
            'data'    => $result,
        ], $result['ok'] ? 200 : 422);
    }

    // ── Audit log ─────────────────────────────────────────────────────

    /**
     * GET /api/v1/admin/moderation/logs
     */
    public function logs(Request $request): JsonResponse
    {
        $logs = ModerationLog::query()
            ->when($request->integer('content_id'), fn ($q, $v) => $q->where('content_id', $v))
            ->when($request->integer('admin_id'),   fn ($q, $v) => $q->where('admin_id', $v))
            ->when($request->input('action_type'),  fn ($q, $v) => $q->where('action_type', $v))
            ->latest()
            ->paginate($request->integer('per_page', 30));

        return response()->json([
            'success' => true,
            'data'    => $logs->items(),
            'meta'    => ['total' => $logs->total(), 'current_page' => $logs->currentPage()],
        ]);
    }

    // ── Stats ─────────────────────────────────────────────────────────

    /**
     * GET /api/v1/admin/moderation/stats
     */
    public function stats(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => [
                'pending_review' => MediaModeration::where('decision', 'pending_review')->count(),
                'approved'       => MediaModeration::where('decision', 'approved')->count(),
                'rejected'       => MediaModeration::where('decision', 'rejected')->count(),
                'failed_scans'   => MediaModeration::where('scan_status', 'failed')->count(),
                'total_scanned'  => MediaModeration::where('scan_status', 'completed')->count(),
            ],
        ]);
    }

    // ── Helpers ───────────────────────────────────────────────────────

    private function format(MediaModeration $rec): array
    {
        return [
            'id'                     => $rec->id,
            'content_id'             => $rec->content_id,
            'user_id'                => $rec->user_id,
            'content_type'           => $rec->content_type,
            'scan_status'            => $rec->scan_status,
            'nudity_detected'        => $rec->nudity_detected,
            'nudity_score'           => $rec->nudity_score,
            'nsfw_score'             => $rec->nsfw_score,
            'detected_labels'        => $rec->detected_labels_json ?? [],
            'scanned_frames_count'   => $rec->scanned_frames_count,
            'highest_risk_timestamp' => $rec->highest_risk_timestamp,
            'decision'               => $rec->decision,
            'reason'                 => $rec->reason,
            'model_name'             => $rec->model_name,
            'model_version'          => $rec->model_version,
            'scanned_at'             => $rec->scanned_at?->toISOString(),
            'admin_review_status'    => $rec->admin_review_status,
            'admin_reviewed_by'      => $rec->adminReviewer?->username,
            'admin_reviewed_at'      => $rec->admin_reviewed_at?->toISOString(),
            'created_at'             => $rec->created_at?->toISOString(),
        ];
    }

    private function safePreviewUrl(?string $key): ?string
    {
        if (!$key) return null;
        try {
            // Any object-storage backend gets an expiring link. StorageService
            // resolves which bucket actually holds the key, which matters while
            // R2 and B2 are both live: presigning against the wrong one yields
            // a URL that 404s, and a moderator would read that as "no evidence"
            // rather than "wrong bucket".
            if (in_array(config('filesystems.default'), ['r2', 'b2'], true)) {
                return $this->storage->temporaryUrl($key, 30);
            }
            return Storage::url($key);
        } catch (\Throwable) {
            return null;
        }
    }
}
