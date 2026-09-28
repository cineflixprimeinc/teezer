<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\VideoResource;
use App\Models\MusicFavorite;
use App\Models\MusicPlayLog;
use App\Models\MusicTrack;
use App\Models\MusicUsage;
use App\Models\Video;
use App\Services\MediaPresignService;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;

class MusicLibraryController extends Controller
{
    // ── Studio music library ──────────────────────────────────────────────────

    public function library(Request $request): JsonResponse
    {
        $q = MusicTrack::where('source_type', 'library')->where('status', 'published')->where('show_in_studio', true);

        if ($request->filled('search')) {
            $t = $request->string('search')->trim();
            $q->where(fn ($sq) =>
                $sq->where('title', 'ilike', "%{$t}%")
                   ->orWhere('artist_name', 'ilike', "%{$t}%")
            );
        }
        if ($request->filled('mood'))     $q->where('mood',     'ilike', '%'.$request->mood.'%');
        if ($request->filled('genre'))    $q->where('genre',    'ilike', '%'.$request->genre.'%');
        if ($request->filled('language')) $q->where('language', 'ilike', '%'.$request->language.'%');

        if ($request->filled('duration')) {
            match ($request->duration) {
                'short'     => $q->where('duration', '<', 60),
                'medium'    => $q->whereBetween('duration', [60, 180]),
                'long'      => $q->whereBetween('duration', [181, 300]),
                'very_long' => $q->where('duration', '>', 300),
                default     => null,
            };
        }

        if ($request->filled('usage_rights')) {
            $q->where('license_type', $request->usage_rights);
        }

        $category = $request->string('category', 'all')->value();
        if ($category === 'trending') {
            $q->orderByDesc('plays_count');
        } elseif ($category === 'featured') {
            $q->where('featured', true)->latest();
        } elseif ($category === 'recommended') {
            $q->where('recommended', true)->latest();
        } elseif ($category === 'teezer_originals') {
            $q->where(fn ($sq) =>
                $sq->where('artist_name', 'ilike', '%teezer%')
                   ->orWhereNotNull('created_by_admin_id')
            )->latest();
        } elseif ($category === 'artist_originals') {
            $q->where('artist_name', 'not ilike', '%teezer%')
              ->whereNull('created_by_admin_id')
              ->latest();
        } elseif (in_array($category, ['hip_hop','electronic','rock','jazz','rnb','classical','indie','nepali','pop'], true)) {
            $genreMap = [
                'hip_hop'    => 'Hip-hop',
                'electronic' => 'Electronic',
                'rock'       => 'Rock',
                'jazz'       => 'Jazz',
                'rnb'        => 'R&B',
                'classical'  => 'Classical',
                'indie'      => 'Indie',
                'nepali'     => 'Nepali',
                'pop'        => 'Pop',
            ];
            $q->where('genre', 'ilike', '%'.$genreMap[$category].'%')->latest();
        } elseif (!in_array($category, ['all', ''], true)) {
            $q->where('mood', 'ilike', '%'.ucfirst($category).'%')->latest();
        } else {
            $q->latest();
        }

        if ($userId = Auth::id()) {
            // withExists, not withCount or a loaded relation: this only ever
            // needs a boolean per row, and an EXISTS subquery stops at the
            // first match instead of counting every favourite of a popular
            // track on every page of the browser.
            $q->withExists(['favorites as is_favorited' => fn ($fq) => $fq->where('user_id', $userId)]);
        }

        $tracks = $q->paginate(20);

        return response()->json(['success' => true, 'data' => $tracks]);
    }

    // ── Saved sounds ──────────────────────────────────────────────────────────

    /** GET /music/favorites - the caller's saved sounds, most recently saved
     *  first. Ordered by when it was SAVED, not when the track was published,
     *  which is the order the user actually remembers putting them in. */
    public function favorites(Request $request): JsonResponse
    {
        $tracks = MusicTrack::query()
            ->join('music_favorites', 'music_favorites.music_track_id', '=', 'music_tracks.id')
            ->where('music_favorites.user_id', $request->user()->id)
            ->orderByDesc('music_favorites.created_at')
            ->select('music_tracks.*')
            ->paginate(20);

        // Every row here is saved by definition, so the flag is set directly
        // rather than paying for a second subquery to rediscover it.
        $tracks->getCollection()->each(fn (MusicTrack $t) => $t->setAttribute('is_favorited', true));

        return response()->json(['success' => true, 'data' => $tracks]);
    }

    /** POST /music/{id}/favorite - saves the sound, or unsaves it if it was
     *  already saved. One endpoint for both directions so the client never has
     *  to know which state it is in before tapping. */
    public function toggleFavorite(Request $request, int $id): JsonResponse
    {
        $track  = MusicTrack::findOrFail($id);
        $userId = $request->user()->id;

        $existing = MusicFavorite::where('user_id', $userId)
            ->where('music_track_id', $track->id)
            ->first();

        if ($existing) {
            $existing->delete();
            $saved = false;
        } else {
            // firstOrCreate rather than create: the unique index would throw on
            // a double tap that races itself, and a duplicate save is not an
            // error worth showing anyone.
            MusicFavorite::firstOrCreate(['user_id' => $userId, 'music_track_id' => $track->id]);
            $saved = true;
        }

        return response()->json(['success' => true, 'data' => ['saved' => $saved]]);
    }

    // ── Upload picker (content upload modal) ──────────────────────────────────

    public function picker(Request $request): JsonResponse
    {
        $q = MusicTrack::where('source_type', 'library')
            ->where('status', 'published')
            ->where(fn ($sq) =>
                $sq->where('show_in_upload_picker', true)
                   ->orWhere('allow_reels', true)
                   ->orWhere('allow_stories', true)
            );

        if ($request->filled('search')) {
            $t = $request->string('search')->trim();
            $q->where(fn ($sq) =>
                $sq->where('title', 'ilike', "%{$t}%")
                   ->orWhere('artist_name', 'ilike', "%{$t}%")
            );
        }
        if ($request->filled('mood'))  $q->where('mood',  $request->mood);
        if ($request->filled('genre')) $q->where('genre', $request->genre);
        if ($request->filled('type')) {
            match ($request->type) {
                'reels'   => $q->where('allow_reels',   true),
                'stories' => $q->where('allow_stories', true),
                default   => null,
            };
        }

        $tracks = $q->orderByDesc('plays_count')->paginate(20);
        return response()->json(['success' => true, 'data' => $tracks]);
    }

    // ── Trending ─────────────────────────────────────────────────────────────

    public function trending(): JsonResponse
    {
        $tracks = MusicTrack::where('source_type', 'library')
            ->where('status', 'published')
            ->orderByDesc('plays_count')
            ->take(10)
            ->get();
        return response()->json(['success' => true, 'data' => $tracks]);
    }

    // ── Weekly popular (top 5 by plays in last 7 days) ───────────────────────

    public function weeklyPopular(Request $request): JsonResponse
    {
        $limit = (int) min($request->get('limit', 5), 20);
        $since = now()->subDays(7);

        // Try to get weekly play counts from logs first
        $weekly = \DB::table('music_play_logs as pl')
            ->join('music_tracks as mt', 'mt.id', '=', 'pl.track_id')
            ->where('pl.played_at', '>=', $since)
            ->where('mt.status', 'published')
            ->selectRaw('mt.id, mt.title, mt.artist_name, mt.cover_url, mt.audio_url, mt.plays_count, mt.duration, COUNT(pl.id) as week_plays')
            ->groupBy('mt.id', 'mt.title', 'mt.artist_name', 'mt.cover_url', 'mt.audio_url', 'mt.plays_count', 'mt.duration')
            ->orderByDesc('week_plays')
            ->limit($limit)
            ->get();

        // Fall back to overall plays_count if no weekly log data
        if ($weekly->isEmpty()) {
            $weekly = MusicTrack::where('status', 'published')
                ->orderByDesc('plays_count')
                ->take($limit)
                ->get(['id', 'title', 'artist_name', 'cover_url', 'audio_url', 'plays_count', 'duration']);
        }

        return response()->json(['success' => true, 'data' => $weekly]);
    }

    // ── Log play ─────────────────────────────────────────────────────────────

    public function play(Request $request, int $id): JsonResponse
    {
        $track = MusicTrack::findOrFail($id);
        $track->increment('plays_count');

        MusicPlayLog::create([
            'track_id'  => $id,
            'user_id'   => Auth::id(),
            'source'    => $request->input('source', 'studio'),
            'played_at' => now(),
        ]);

        return response()->json(['success' => true]);
    }

    // ── Music detail page ─────────────────────────────────────────────────────

    public function show(int $id): JsonResponse
    {
        $track = MusicTrack::findOrFail($id);
        $track->loadCount('videos');

        $data = $track->toArray();

        // Original audio tracks need a signed CDN URL. MediaPresignService, not
        // a hand-rolled signer - this used to reimplement a retired
        // HMAC-SHA256-hex scheme that nginx's current secure_link_md5
        // validation rejects (403), silencing every "original audio" track's
        // playback. VideoService stores the full CDN URL (https://...)
        // directly, so the key has to be extracted from it rather than
        // assuming a raw key, same as before.
        $audioUrl = $data['audio_url'] ?? null;
        if (($data['source_type'] ?? null) === 'original' && $audioUrl) {
            $key = str_starts_with($audioUrl, 'http')
                ? ltrim(parse_url($audioUrl, PHP_URL_PATH) ?: '', '/')
                : $audioUrl;
            if ($key !== '') {
                $data['audio_url'] = MediaPresignService::signedMediaUrl($key, 1440);
            }
        }

        // For original tracks, include the uploader's profile so the frontend can link to it
        if (($data['source_type'] ?? null) === 'original' && !empty($data['source_video_id'])) {
            $video = Video::with('user:id,username,name,is_verified,avatar')->find($data['source_video_id']);
            if ($video && $video->user) {
                $u = $video->user;
                $data['uploader'] = [
                    'id'          => $u->id,
                    'username'    => $u->username,
                    'name'        => $u->name,
                    'is_verified' => (bool) $u->is_verified,
                    'avatar'      => $u->avatar ? Storage::url($u->avatar) : StorageService::defaultAvatarUrl(),
                ];
            }
        }

        return response()->json(['success' => true, 'data' => $data]);
    }

    public function videos(Request $request, int $id): JsonResponse
    {
        MusicTrack::findOrFail($id);

        $sort  = $request->string('sort', 'popular')->value();
        $limit = max(1, min(50, (int) $request->get('limit', 20)));

        // `user.profile`, not `user`: VideoResource reads the creator's
        // follower/like totals off the profile, so loading the user alone still
        // lazy-loaded one profile per row.
        $query = Video::with(['user.profile', 'musicTrack'])
            ->withVisibleCommentsCount()
            ->where('music_track_id', $id)
            ->where('status', 'published')
            ->where(fn ($q) => $q->whereNull('moderation_status')->orWhere('moderation_status', '!=', 'rejected'))
            ->whereNull('deleted_at');

        match ($sort) {
            'recent' => $query->orderByDesc('created_at'),
            'likes'  => $query->orderByDesc('likes_count'),
            default  => $query->orderByDesc('views_count'),
        };

        $videos = $query->paginate($limit);

        Video::attachViewerFlags($videos, $request->user());

        return response()->json([
            'success' => true,
            'data'    => VideoResource::collection($videos),
            'meta'    => [
                'current_page'  => $videos->currentPage(),
                'last_page'     => $videos->lastPage(),
                'per_page'      => $videos->perPage(),
                'total'         => $videos->total(),
                'next_page_url' => $videos->nextPageUrl(),
            ],
        ]);
    }

    // ── Log usage ─────────────────────────────────────────────────────────────

    public function use(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'content_id'   => ['nullable', 'integer'],
            'content_type' => ['nullable', 'string', 'in:reel,video,story,photo'],
        ]);

        $track = MusicTrack::findOrFail($id);
        $track->increment('uses_count');

        MusicUsage::create([
            'track_id'     => $id,
            'user_id'      => Auth::id(),
            'content_id'   => $request->content_id,
            'content_type' => $request->content_type,
            'used_at'      => now(),
        ]);

        return response()->json(['success' => true]);
    }
}
