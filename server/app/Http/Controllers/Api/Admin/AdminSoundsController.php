<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\MusicTrack;
use App\Models\Video;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminSoundsController extends Controller
{
    /**
     * GET /admin/sounds
     * All music tracks that have been used in at least one video,
     * plus tracks from the library (shows_in_upload_picker) so admins
     * can see the full picture.
     */
    public function index(Request $request): JsonResponse
    {
        $q = MusicTrack::withCount('videos');

        if ($request->filled('q')) {
            $term = $request->string('q')->trim();
            $q->where(fn ($sq) =>
                $sq->where('title', 'ilike', "%{$term}%")
                   ->orWhere('artist_name', 'ilike', "%{$term}%")
            );
        }

        if ($request->filled('status')) {
            $q->where('status', $request->status);
        }

        // Filter to only tracks used in videos
        if ($request->boolean('used_only', false)) {
            $q->having('videos_count', '>', 0);
        }

        $sort = $request->string('sort', 'popular')->value();
        match ($sort) {
            'newest'  => $q->orderByDesc('created_at'),
            'title'   => $q->orderBy('title'),
            'plays'   => $q->orderByDesc('plays_count'),
            default   => $q->orderByDesc('videos_count')->orderByDesc('plays_count'),
        };

        $perPage = max(1, min(50, (int) $request->get('per_page', 20)));
        $tracks  = $q->paginate($perPage);

        return response()->json([
            'success' => true,
            'data'    => $tracks->items(),
            'meta'    => [
                'current_page' => $tracks->currentPage(),
                'last_page'    => $tracks->lastPage(),
                'per_page'     => $tracks->perPage(),
                'total'        => $tracks->total(),
            ],
        ]);
    }

    /**
     * GET /admin/sounds/stats
     */
    public function stats(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => [
                'total_tracks'  => MusicTrack::count(),
                'published'     => MusicTrack::where('status', 'published')->count(),
                'tracks_in_use' => MusicTrack::has('videos')->count(),
                'total_uses'    => (int) MusicTrack::sum('uses_count'),
                'total_plays'   => (int) MusicTrack::sum('plays_count'),
                'most_used'     => MusicTrack::withCount('videos')
                                        ->orderByDesc('videos_count')
                                        ->first(['id', 'title', 'artist_name', 'cover_url', 'videos_count']),
            ],
        ]);
    }

    /**
     * GET /admin/sounds/{id}/videos
     * Paginated list of videos using this track, with uploader info.
     */
    public function videos(Request $request, int $id): JsonResponse
    {
        MusicTrack::findOrFail($id);

        $sort  = $request->string('sort', 'views')->value();
        $query = Video::with(['user'])
            ->where('music_track_id', $id)
            ->whereNull('deleted_at');

        match ($sort) {
            'recent' => $query->orderByDesc('created_at'),
            'likes'  => $query->orderByDesc('likes_count'),
            default  => $query->orderByDesc('views_count'),
        };

        $perPage = max(1, min(50, (int) $request->get('per_page', 20)));
        $videos  = $query->paginate($perPage);

        $items = $videos->map(fn (Video $v) => [
            'id'            => $v->id,
            'title'         => $v->title,
            'caption'       => $v->caption,
            'thumbnail_url' => $v->thumbnail_url,
            'video_url'     => $v->video_url,
            'status'        => $v->status,
            'views_count'   => (int) $v->views_count,
            'likes_count'   => (int) $v->likes_count,
            'comments_count'=> (int) $v->comments_count,
            'created_at'    => $v->created_at?->toISOString(),
            'user'          => $v->user ? [
                'id'          => $v->user->id,
                'username'    => $v->user->username,
                'name'        => $v->user->name,
                'avatar'      => $v->user->avatar ?? $v->user->profile?->avatar ?? null,
                'is_verified' => (bool) ($v->user->is_verified ?? false),
            ] : null,
        ]);

        return response()->json([
            'success' => true,
            'data'    => $items,
            'meta'    => [
                'current_page' => $videos->currentPage(),
                'last_page'    => $videos->lastPage(),
                'per_page'     => $videos->perPage(),
                'total'        => $videos->total(),
            ],
        ]);
    }
}
