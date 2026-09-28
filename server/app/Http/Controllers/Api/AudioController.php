<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AudioFavorite;
use App\Models\AudioTrack;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;

class AudioController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = AudioTrack::query();

        if ($request->filled('search')) {
            $term = $request->string('search')->trim();
            $query->where(fn ($q) =>
                $q->where('title', 'ilike', "%{$term}%")
                  ->orWhere('artist', 'ilike', "%{$term}%")
            );
        }

        if ($request->filled('mood')) {
            $query->where('mood', $request->mood);
        }

        if ($request->filled('genre')) {
            $query->where('genre', $request->genre);
        }

        if ($request->filled('usage_rights')) {
            $query->where('usage_rights', $request->usage_rights);
        }

        if ($request->filled('duration')) {
            match ($request->duration) {
                'short'  => $query->where('duration', '<', 60),
                'medium' => $query->whereBetween('duration', [60, 180]),
                'long'   => $query->where('duration', '>', 180),
                default  => null,
            };
        }

        $category = $request->string('category', 'all')->value();
        if ($category === 'trending') {
            $query->orderByDesc('usage_count');
        } elseif (!in_array($category, ['all', ''], true)) {
            $query->where('mood', ucfirst($category))->orderByDesc('usage_count');
        } else {
            $query->latest();
        }

        $tracks = $query->paginate(20);

        if (Auth::check()) {
            $userId = Auth::id();
            $favIds = AudioFavorite::where('user_id', $userId)
                ->whereIn('audio_track_id', $tracks->pluck('id'))
                ->pluck('audio_track_id')
                ->flip();

            $tracks->getCollection()->transform(function ($track) use ($favIds) {
                $track->is_favorited = $favIds->has($track->id);
                return $track;
            });
        }

        return response()->json(['success' => true, 'data' => $tracks]);
    }

    public function trending(): JsonResponse
    {
        // Top-10 sounds barely change - cache for an hour (public, same for all).
        $tracks = Cache::remember('audio:trending:top10', now()->addHour(), fn () =>
            AudioTrack::orderByDesc('usage_count')->take(10)->get()
        );
        return response()->json(['success' => true, 'data' => $tracks])
            ->header('Cache-Control', 'public, max-age=1800');
    }

    public function search(Request $request): JsonResponse
    {
        $request->validate(['q' => ['required', 'string', 'min:1', 'max:100']]);
        $term = $request->string('q')->trim();

        $tracks = AudioTrack::where('title', 'ilike', "%{$term}%")
            ->orWhere('artist', 'ilike', "%{$term}%")
            ->orderByDesc('usage_count')
            ->take(20)
            ->get();

        return response()->json(['success' => true, 'data' => $tracks]);
    }

    public function show(int $id): JsonResponse
    {
        $track = AudioTrack::findOrFail($id);
        return response()->json(['success' => true, 'data' => $track]);
    }

    public function videos(int $id): JsonResponse
    {
        $track = AudioTrack::findOrFail($id);
        $videos = $track->videos()->latest()->take(20)->get();
        return response()->json(['success' => true, 'data' => $videos]);
    }

    public function mySounds(): JsonResponse
    {
        $tracks = AudioTrack::where('user_id', Auth::id())
            ->where('is_original', true)
            ->withCount('videos as uses_count')
            ->latest()
            ->get();

        return response()->json(['success' => true, 'data' => $tracks]);
    }

    public function favorites(): JsonResponse
    {
        $trackIds = AudioFavorite::where('user_id', Auth::id())
            ->pluck('audio_track_id');

        $tracks = AudioTrack::whereIn('id', $trackIds)
            ->latest()
            ->get()
            ->map(function ($track) {
                $track->is_favorited = true;
                return $track;
            });

        return response()->json(['success' => true, 'data' => $tracks]);
    }

    public function toggleFavorite(int $id): JsonResponse
    {
        AudioTrack::findOrFail($id);
        $userId = Auth::id();

        $existing = AudioFavorite::where('user_id', $userId)
            ->where('audio_track_id', $id)
            ->first();

        if ($existing) {
            $existing->delete();
            return response()->json(['success' => true, 'favorited' => false]);
        }

        AudioFavorite::create(['user_id' => $userId, 'audio_track_id' => $id]);
        return response()->json(['success' => true, 'favorited' => true]);
    }

    // ── Admin-only methods ────────────────────────────────────────────────────

    public function adminIndex(Request $request): JsonResponse
    {
        $query = AudioTrack::withCount('videos as uses_count');

        if ($request->filled('search')) {
            $term = $request->string('search')->trim();
            $query->where(fn ($q) =>
                $q->where('title', 'ilike', "%{$term}%")
                  ->orWhere('artist', 'ilike', "%{$term}%")
            );
        }

        if ($request->filled('mood'))   $query->where('mood',         $request->mood);
        if ($request->filled('genre'))  $query->where('genre',        $request->genre);

        $tracks = $query->latest()->paginate(20);

        $stats = [
            'total'    => AudioTrack::count(),
            'trending' => AudioTrack::where('usage_count', '>', 0)->count(),
            'artists'  => AudioTrack::whereNotNull('artist')->distinct('artist')->count('artist'),
        ];

        return response()->json(['success' => true, 'data' => $tracks, 'stats' => $stats]);
    }

    public function adminStore(Request $request): JsonResponse
    {
        $request->validate([
            'title'        => ['required', 'string', 'max:255'],
            'artist'       => ['nullable', 'string', 'max:255'],
            'mood'         => ['nullable', 'string', 'max:50'],
            'genre'        => ['nullable', 'string', 'max:50'],
            'usage_rights' => ['nullable', 'string', 'in:free_for_social,attribution_required'],
            'audio_file'   => ['required', 'file', 'mimes:mp3,wav,ogg,aac,m4a', 'max:51200'],
            'cover_image'  => ['nullable', 'image', 'max:5120'],
        ]);

        $audioPath = $request->file('audio_file')->store('audio', 'public');
        $coverPath = $request->hasFile('cover_image')
            ? $request->file('cover_image')->store('audio/covers', 'public')
            : null;

        $audioUrl = asset('storage/' . $audioPath);
        $coverUrl = $coverPath ? asset('storage/' . $coverPath) : null;

        $track = AudioTrack::create([
            'title'        => $request->title,
            'artist'       => $request->artist,
            'mood'         => $request->mood,
            'genre'        => $request->genre,
            'usage_rights' => $request->input('usage_rights', 'attribution_required'),
            'audio_url'    => $audioUrl,
            'cover_url'    => $coverUrl,
            'is_original'  => false,
        ]);

        return response()->json(['success' => true, 'data' => $track], 201);
    }

    public function adminDestroy(int $id): JsonResponse
    {
        $track = AudioTrack::findOrFail($id);
        $track->delete();
        return response()->json(['success' => true, 'message' => 'Track deleted.']);
    }
}
