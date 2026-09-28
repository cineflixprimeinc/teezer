<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminActionLog;
use App\Models\User;
use App\Models\Video;
use App\Models\VideoReport;
use App\Models\VideoView;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminApiController extends Controller
{
    // ── Dashboard stats ────────────────────────────────────────────────

    public function dashboardStats(): JsonResponse
    {
        $today = now()->toDateString();
        $week  = now()->subDays(7)->toDateString();

        return response()->json([
            'success' => true,
            'data'    => [
                'users' => [
                    'total'       => User::count(),
                    'new_today'   => User::whereDate('created_at', $today)->count(),
                    'new_7d'      => User::where('created_at', '>=', $week)->count(),
                    'banned'      => User::where('is_banned', true)->count(),
                    'creators'    => User::where('role', 'creator')->count(),
                    'admins'      => User::where('role', 'admin')->count(),
                ],
                'videos' => [
                    'total'        => Video::withTrashed()->count(),
                    'published'    => Video::where('status', 'published')->count(),
                    'draft'        => Video::where('status', 'draft')->count(),
                    'private'      => Video::where('status', 'private')->count(),
                    'removed'      => Video::withTrashed()->whereNotNull('deleted_at')->count(),
                    'flagged'      => Video::where('is_flagged', true)->count(),
                    'uploaded_today'=> Video::whereDate('created_at', $today)->count(),
                ],
                'reports' => [
                    'pending'  => VideoReport::where('status', 'pending')->count(),
                    'reviewed' => VideoReport::where('status', 'reviewed')->count(),
                    'actioned' => VideoReport::where('status', 'actioned')->count(),
                ],
                'views' => [
                    'today' => VideoView::whereDate('created_at', $today)->count(),
                    '7d'    => VideoView::where('created_at', '>=', $week)->count(),
                ],
            ],
        ]);
    }

    // ── User stats ─────────────────────────────────────────────────────

    public function userStats(): JsonResponse
    {
        $now       = now();
        $weekStart = $now->copy()->subDays(7)->startOfDay();
        $prevStart = $now->copy()->subDays(14)->startOfDay();
        $prevEnd   = $now->copy()->subDays(7)->endOfDay();

        $total      = User::count();
        $active     = User::where('is_banned', false)->where('is_active', true)->count();
        $verified   = User::where('is_verified', true)->count();
        $banned     = User::where('is_banned', true)->count();
        $suspended  = User::where('is_active', false)->where('is_banned', false)->count();
        $newThis    = User::where('created_at', '>=', $weekStart)->count();
        $newPrev    = User::whereBetween('created_at', [$prevStart, $prevEnd])->count();

        $totalPrev  = User::where('created_at', '<', $weekStart)->count();
        $growth     = fn ($cur, $prev) => $prev > 0 ? round(($cur - $prev) / $prev * 100, 1) : ($cur > 0 ? 100.0 : 0.0);

        $growthByDay = User::selectRaw('created_at::date as date, COUNT(*) as count')
            ->where('created_at', '>=', $now->copy()->subDays(30))
            ->groupBy('date')->orderBy('date')->get();

        $byRole = User::selectRaw('role, COUNT(*) as count')
            ->groupBy('role')->pluck('count', 'role');

        $topCountries = User::selectRaw('selected_country_code as country, COUNT(*) as cnt')
            ->whereNotNull('selected_country_code')
            ->groupBy('selected_country_code')
            ->orderByDesc('cnt')
            ->limit(5)
            ->get()
            ->map(fn ($r) => [
                'country' => $r->country,
                'count'   => $r->cnt,
                'pct'     => $total > 0 ? round($r->cnt / $total * 100, 1) : 0,
            ]);

        return response()->json([
            'success' => true,
            'data'    => [
                'total'           => $total,
                'active'          => $active,
                'verified'        => $verified,
                'banned'          => $banned,
                'suspended'       => $suspended,
                'new_signups'     => $newThis,
                'growth' => [
                    'total'       => $growth($total, $totalPrev),
                    'active'      => 0.0,
                    'verified'    => 0.0,
                    'suspended'   => 0.0,
                    'new_signups' => $growth($newThis, $newPrev),
                ],
                'by_role'         => $byRole,
                'top_countries'   => $topCountries,
                'growth_30d'      => $growthByDay,
            ],
        ]);
    }

    // ── Video stats ────────────────────────────────────────────────────

    public function videoStats(): JsonResponse
    {
        $uploadsByDay = Video::selectRaw('created_at::date as date, COUNT(*) as count')
            ->where('created_at', '>=', now()->subDays(30))
            ->groupBy('date')
            ->orderBy('date')
            ->get();

        $viewsByDay = VideoView::selectRaw('created_at::date as date, COUNT(*) as count')
            ->where('created_at', '>=', now()->subDays(30))
            ->groupBy('date')
            ->orderBy('date')
            ->get();

        return response()->json([
            'success' => true,
            'data'    => [
                'total_published'  => Video::where('status', 'published')->count(),
                'total_views'      => VideoView::count(),
                'uploads_30d'      => $uploadsByDay,
                'views_30d'        => $viewsByDay,
            ],
        ]);
    }

    // ── Report stats ───────────────────────────────────────────────────

    public function reportStats(): JsonResponse
    {
        $byReason = VideoReport::selectRaw('reason, COUNT(*) as count')
            ->groupBy('reason')
            ->pluck('count', 'reason');

        $byStatus = VideoReport::selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->pluck('count', 'status');

        $recentReports = VideoReport::with(['video:id,caption,user_id', 'reporter:id,username'])
            ->orderByDesc('created_at')
            ->limit(10)
            ->get(['id', 'video_id', 'reporter_id', 'reason', 'status', 'created_at']);

        return response()->json([
            'success' => true,
            'data'    => [
                'by_status'     => $byStatus,
                'by_reason'     => $byReason,
                'pending_count' => VideoReport::where('status', 'pending')->count(),
                'recent'        => $recentReports,
            ],
        ]);
    }

    // ── Content listing ────────────────────────────────────────────────

    public function videos(Request $request): JsonResponse
    {
        $request->validate([
            'status'       => ['nullable', 'in:published,draft,private,unlisted,removed,reported,all'],
            'content_type' => ['nullable', 'in:video,photo'],
            'flagged'      => ['nullable', 'boolean'],
            'q'            => ['nullable', 'string', 'max:100'],
            'per_page'     => ['nullable', 'integer', 'min:5', 'max:100'],
            'sort'         => ['nullable', 'in:newest,oldest,most_viewed,most_liked,most_reported'],
        ]);

        $status = $request->input('status', 'all');
        // MediaPresignService, not a hand-rolled signer - see AdminVideoController::index()'s
        // matching fix for why (retired HMAC-SHA256-hex scheme, 403s at nginx's
        // secure_link_md5 validation).
        $resolve = function (?string $key): ?string {
            if (!$key) return null;
            if (\Illuminate\Support\Str::startsWith($key, 'http')) return $key;
            return \App\Services\MediaPresignService::signedMediaUrl($key, 120);
        };

        $query = Video::withTrashed()
            ->with(['user:id,username,name,avatar,is_verified', 'hashtags'])
            ->when($request->boolean('flagged'), fn ($q) => $q->where('is_flagged', true))
            ->when($request->input('user_id'), fn ($q, $uid) => $q->where('user_id', (int) $uid))
            ->when($request->input('q'), fn ($q, $term) => $q->where(
                fn ($w) => $w->where('caption', 'ilike', "%{$term}%")
                            ->orWhere('title', 'ilike', "%{$term}%")
                            ->when(is_numeric($term), fn ($id) => $id->orWhere('id', (int) $term))
            ));

        $contentType = $request->input('content_type');

        if ($status === 'removed') {
            $query->whereNotNull('deleted_at');
        } elseif ($contentType) {
            $query->whereNull('deleted_at')->where('status', 'published');
        } elseif ($status === 'reported') {
            $query->whereNull('deleted_at')->where('is_flagged', true);
        } elseif ($status === 'all') {
            // withTrashed already applied, no extra filter
        } else {
            $query->whereNull('deleted_at')->where('status', $status);
        }

        match ($contentType) {
            'photo' => $query->where('mime_type', 'ilike', 'image/%'),
            'video' => $query->where(fn ($q) => $q->whereNull('mime_type')->orWhere('mime_type', 'not ilike', 'image/%'))
                             ->where(fn ($q) => $q->whereNotNull('video_url')->where('video_url', '!=', '')),
            default => null,
        };


        match ($request->input('sort', 'newest')) {
            'oldest'        => $query->orderBy('created_at'),
            'most_viewed'   => $query->orderByDesc('views_count'),
            'most_liked'    => $query->orderByDesc('likes_count'),
            'most_reported' => $query->withCount('reports')->orderByDesc('reports_count'),
            default         => $query->orderByDesc('created_at'),
        };

        $videos = $query->paginate($request->input('per_page', 20));

        return response()->json([
            'success' => true,
            'data'    => $videos->map(fn ($v) => [
                'id'              => $v->id,
                'title'           => $v->title,
                'caption'         => $v->caption,
                'video_url'       => $resolve($v->video_url),
                'thumbnail_url'   => $resolve($v->thumbnail_url),
                'mime_type'       => $v->mime_type,
                'duration'        => $v->duration,
                'width'           => $v->width,
                'height'          => $v->height,
                'status'          => $v->status,
                'is_flagged'      => (bool) $v->is_flagged,
                'is_featured'     => (bool) ($v->is_featured ?? false),
                'views_count'     => $v->views_count,
                'likes_count'     => $v->likes_count,
                'comments_count'  => $v->comments_count,
                'shares_count'    => $v->shares_count,
                'avg_watch_time'  => $v->average_watch_seconds ?: null,
                'created_at'      => $v->created_at->toIso8601String(),
                'deleted_at'      => $v->deleted_at?->toIso8601String(),
                'previous_status' => $v->previous_status,
                'deletion_reason' => $v->deletion_reason,
                'user'            => $v->user ? [
                    'id'          => $v->user->id,
                    'username'    => $v->user->username,
                    'name'        => $v->user->name,
                    'avatar'      => $resolve($v->user->avatar),
                    'is_verified' => (bool) $v->user->is_verified,
                ] : null,
            ]),
            'meta'    => [
                'current_page' => $videos->currentPage(),
                'last_page'    => $videos->lastPage(),
                'per_page'     => $videos->perPage(),
                'total'        => $videos->total(),
                'next_page_url'=> $videos->nextPageUrl(),
            ],
        ]);
    }

    // ── Moderation actions ─────────────────────────────────────────────

    public function banUser(Request $request, int $userId): JsonResponse
    {
        $request->validate(['reason' => ['required', 'string', 'max:500']]);

        $target = User::findOrFail($userId);
        if ($target->isAdmin()) {
            return response()->json(['success' => false, 'message' => 'Cannot ban an admin.'], 422);
        }

        $target->forceFill(['is_banned' => true, 'ban_reason' => $request->input('reason')])->save();
        $target->tokens()->delete();

        AdminActionLog::record(
            $request->user()->id, 'ban_user', 'user_management',
            "Banned user {$target->username}: {$request->input('reason')}",
            'user', $target->id, [], 'high', $request->ip()
        );

        return response()->json(['success' => true, 'message' => "User @{$target->username} banned."]);
    }

    public function unbanUser(Request $request, int $userId): JsonResponse
    {
        $target = User::findOrFail($userId);
        $target->forceFill(['is_banned' => false, 'ban_reason' => null])->save();

        AdminActionLog::record(
            $request->user()->id, 'unban_user', 'user_management',
            "Unbanned user {$target->username}",
            'user', $target->id, [], 'info', $request->ip()
        );

        return response()->json(['success' => true, 'message' => "User @{$target->username} unbanned."]);
    }

    public function removeVideo(Request $request, int $videoId): JsonResponse
    {
        $request->validate(['reason' => ['required', 'string', 'max:500']]);

        $video = Video::findOrFail($videoId);
        $video->update(['status' => 'removed', 'is_flagged' => true]);
        $video->delete();

        AdminActionLog::record(
            $request->user()->id, 'remove_video', 'content_actions',
            "Removed video #{$videoId}: {$request->input('reason')}",
            'video', $videoId, ['reason' => $request->input('reason')], 'high', $request->ip()
        );

        return response()->json(['success' => true, 'message' => 'Video removed.']);
    }

    public function actionReport(Request $request, int $reportId): JsonResponse
    {
        $request->validate(['action' => ['required', 'in:warn,remove,ban,dismiss']]);

        $report = VideoReport::with(['video', 'video.user'])->findOrFail($reportId);
        $action = $request->input('action');

        if ($action === 'remove' && $report->video) {
            $report->video->update(['status' => 'removed', 'is_flagged' => true]);
        }

        if ($action === 'ban' && $report->video?->user) {
            $report->video->user->forceFill([
                'is_banned'  => true,
                'ban_reason' => 'Banned via report moderation',
            ])->save();
            $report->video->user->tokens()->delete();
        }

        $report->update([
            'status'      => $action === 'dismiss' ? 'dismissed' : 'actioned',
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
        ]);

        AdminActionLog::record(
            $request->user()->id, 'action_report', 'content_actions',
            "Report #{$reportId} actioned: {$action}",
            'video', $report->video_id, ['action' => $action], 'medium', $request->ip()
        );

        return response()->json(['success' => true, 'message' => "Report {$action}ed."]);
    }

    // ── Audit log ──────────────────────────────────────────────────────

    public function actionLogs(Request $request): JsonResponse
    {
        $request->validate([
            'category'   => ['nullable', 'string'],
            'severity'   => ['nullable', 'in:critical,high,medium,info'],
            'admin_id'   => ['nullable', 'integer'],
            'per_page'   => ['nullable', 'integer', 'min:5', 'max:100'],
        ]);

        $logs = AdminActionLog::with('admin:id,username,name')
            ->when($request->input('category'), fn ($q, $c) => $q->where('category', $c))
            ->when($request->input('severity'),  fn ($q, $s) => $q->where('severity', $s))
            ->when($request->input('admin_id'),  fn ($q, $id) => $q->where('admin_id', $id))
            ->orderByDesc('created_at')
            ->paginate($request->input('per_page', 20));

        return response()->json([
            'success' => true,
            'data'    => $logs->map(fn ($log) => [
                'id'          => $log->id,
                'action'      => $log->action,
                'category'    => $log->category,
                'target_type' => $log->target_type,
                'target_id'   => $log->target_id,
                'description' => $log->description,
                'severity'    => $log->severity,
                'ip_address'  => $log->ip_address,
                'created_at'  => $log->created_at->toIso8601String(),
                'admin'       => [
                    'id'       => $log->admin->id,
                    'username' => $log->admin->username,
                    'name'     => $log->admin->name,
                ],
            ]),
            'meta'    => [
                'current_page' => $logs->currentPage(),
                'last_page'    => $logs->lastPage(),
                'total'        => $logs->total(),
            ],
        ]);
    }
}
