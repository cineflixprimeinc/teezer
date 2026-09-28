<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\MusicTrack;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AdminMusicController extends Controller
{
    public function __construct(private StorageService $storage) {}

    private function getStats(): array
    {
        $base = fn () => MusicTrack::where('source_type', 'library');

        return [
            'total'           => $base()->count(),
            'published'       => $base()->where('status', 'published')->count(),
            'total_plays'     => (int) $base()->sum('plays_count'),
            'artists'         => $base()->whereNotNull('artist_name')->distinct('artist_name')->count('artist_name'),
            'new_this_week'   => $base()->where('created_at', '>=', now()->subWeek())->count(),
            'teezer_count'   => $base()->where(fn ($q) =>
                                     $q->where('artist_name', 'ilike', '%teezer%')
                                       ->orWhereNotNull('created_by_admin_id')
                                 )->count(),
            'artist_count'    => $base()->where('artist_name', 'not ilike', '%teezer%')
                                        ->whereNull('created_by_admin_id')
                                        ->count(),
        ];
    }

    private function parseBool($value, bool $default = false): bool
    {
        if (is_bool($value)) return $value;
        if (is_string($value)) return in_array(strtolower($value), ['true', '1', 'yes', 'on'], true);
        return (bool) $value ?: $default;
    }

    // ── Index ─────────────────────────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $q = MusicTrack::where('source_type', 'library');

        if ($request->filled('search')) {
            $t = $request->string('search')->trim();
            $q->where(fn ($sq) =>
                $sq->where('title', 'ilike', "%{$t}%")
                   ->orWhere('artist_name', 'ilike', "%{$t}%")
            );
        }
        if ($request->filled('mood'))   $q->where('mood',   $request->mood);
        if ($request->filled('genre'))  $q->where('genre',  $request->genre);
        if ($request->filled('status')) $q->where('status', $request->status);

        if ($request->filled('source')) {
            if ($request->source === 'teezer') {
                $q->where(fn ($sq) =>
                    $sq->where('artist_name', 'ilike', '%teezer%')
                       ->orWhereNotNull('created_by_admin_id')
                );
            } elseif ($request->source === 'artist') {
                $q->where('artist_name', 'not ilike', '%teezer%')
                  ->whereNull('created_by_admin_id');
            }
        }

        $perPage = min((int) $request->input('per_page', 10), 50);
        $tracks  = $q->latest()->paginate($perPage);

        return response()->json([
            'success' => true,
            'data'    => $tracks,
            'stats'   => $this->getStats(),
        ]);
    }

    // ── Show ──────────────────────────────────────────────────────────────────

    public function show(int $id): JsonResponse
    {
        return response()->json(['success' => true, 'data' => MusicTrack::findOrFail($id)]);
    }

    // ── Store ─────────────────────────────────────────────────────────────────

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'title'           => ['required', 'string', 'max:255'],
            'artist_name'     => ['nullable', 'string', 'max:255'],
            'album'           => ['nullable', 'string', 'max:255'],
            'genre'           => ['nullable', 'string', 'max:100'],
            'mood'            => ['nullable', 'string', 'max:100'],
            'language'        => ['nullable', 'string', 'max:50'],
            'bpm'             => ['nullable', 'integer', 'min:1', 'max:999'],
            'music_key'       => ['nullable', 'string', 'max:20'],
            'isrc'            => ['nullable', 'string', 'max:50'],
            'copyright_owner' => ['nullable', 'string', 'max:255'],
            'license_type'    => ['nullable', 'string', 'max:100'],
            'description'     => ['nullable', 'string', 'max:5000'],
            'lyrics'          => ['nullable', 'string'],
            'status'          => ['nullable', 'in:draft,published,pending,archived,rejected'],
            'duration'        => ['nullable', 'numeric', 'min:0'],
            'bitrate'         => ['nullable', 'integer', 'min:1'],
            'sample_rate'     => ['nullable', 'integer', 'min:1'],
            'audio_file'      => ['required', 'file', 'mimes:mp3,wav,ogg,aac,flac,m4a', 'max:204800'],
            'cover_image'     => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ]);

        // Upload audio to R2 CDN
        $audioFile = $request->file('audio_file');
        $audioExt  = strtolower($audioFile->getClientOriginalExtension() ?: ($audioFile->guessExtension() ?? 'mp3'));
        $audioKey  = $this->storage->storeAudio($audioFile);
        $audioUrl  = $this->storage->url($audioKey);

        // Upload cover image to R2 CDN
        $coverKey = null;
        $coverUrl = null;
        if ($request->hasFile('cover_image')) {
            $coverKey = $this->storage->storeImage($request->file('cover_image'), 'music/covers');
            $coverUrl = $this->storage->url($coverKey);
        }

        // Parse JSON arrays sent as strings from FormData
        $featuring  = $this->parseJsonField($request->input('featuring_artists'));
        $tags       = $this->parseJsonField($request->input('tags'));
        $perms      = $this->parseJsonField($request->input('usage_permissions'));
        $regions    = $this->parseJsonField($request->input('region_restrictions'));

        $track = MusicTrack::create([
            'title'                  => $request->title,
            'artist_name'            => $request->artist_name,
            'album'                  => $request->album,
            'featuring_artists'      => $featuring,
            'genre'                  => $request->genre,
            'mood'                   => $request->mood,
            'language'               => $request->language,
            'tags'                   => $tags,
            'release_date'           => $request->release_date,
            'bpm'                    => $request->bpm,
            'music_key'              => $request->music_key,
            'isrc'                   => $request->isrc,
            'copyright_owner'        => $request->copyright_owner,
            'license_type'           => $request->license_type,
            'usage_permissions'      => $perms,
            'region_restrictions'    => $regions,
            'commercial_use_allowed' => $this->parseBool($request->input('commercial_use_allowed'), true),
            'creator_safe'           => $this->parseBool($request->input('creator_safe'), true),
            'monetization_safe'      => $this->parseBool($request->input('monetization_safe'), true),
            'explicit_content'       => $this->parseBool($request->input('explicit_content'), false),
            'description'            => $request->description,
            'lyrics'                 => $request->lyrics,
            'audio_r2_key'           => $audioKey,
            'audio_url'              => $audioUrl,
            'cover_r2_key'           => $coverKey,
            'cover_url'              => $coverUrl,
            'duration'               => $request->filled('duration') ? (int) round((float) $request->duration) : null,
            'file_size'              => $audioFile->getSize(),
            'format'                 => $audioExt,
            'bitrate'                => $request->bitrate,
            'sample_rate'            => $request->sample_rate,
            'status'                 => $request->input('status', 'draft'),
            'recommended'            => $this->parseBool($request->input('recommended'), false),
            'featured'               => $this->parseBool($request->input('featured'), false),
            'allow_reels'            => $this->parseBool($request->input('allow_reels'), true),
            'allow_stories'          => $this->parseBool($request->input('allow_stories'), true),
            'allow_downloads'        => $this->parseBool($request->input('allow_downloads'), false),
            'show_in_studio'         => $this->parseBool($request->input('show_in_studio'), true),
            'show_in_upload_picker'  => $this->parseBool($request->input('show_in_upload_picker'), true),
            'created_by_admin_id'    => Auth::id(),
        ]);

        return response()->json(['success' => true, 'data' => $track], 201);
    }

    // ── Update ────────────────────────────────────────────────────────────────

    public function update(Request $request, int $id): JsonResponse
    {
        $track = MusicTrack::findOrFail($id);

        $request->validate([
            'title'           => ['sometimes', 'required', 'string', 'max:255'],
            'artist_name'     => ['nullable', 'string', 'max:255'],
            'album'           => ['nullable', 'string', 'max:255'],
            'genre'           => ['nullable', 'string', 'max:100'],
            'mood'            => ['nullable', 'string', 'max:100'],
            'language'        => ['nullable', 'string', 'max:50'],
            'bpm'             => ['nullable', 'integer', 'min:1', 'max:999'],
            'copyright_owner' => ['nullable', 'string', 'max:255'],
            'license_type'    => ['nullable', 'string', 'max:100'],
            'description'     => ['nullable', 'string', 'max:5000'],
            'status'          => ['nullable', 'in:draft,published,pending,archived,rejected'],
            'cover_image'     => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ]);

        $updates = $request->only([
            'title', 'artist_name', 'album', 'genre', 'mood', 'language',
            'release_date', 'bpm', 'music_key', 'isrc', 'copyright_owner',
            'license_type', 'description', 'lyrics', 'status',
        ]);

        foreach ([
            'commercial_use_allowed', 'creator_safe', 'monetization_safe', 'explicit_content',
            'recommended', 'featured', 'allow_reels', 'allow_stories', 'allow_downloads',
            'show_in_studio', 'show_in_upload_picker',
        ] as $bool) {
            if ($request->has($bool)) {
                $updates[$bool] = $this->parseBool($request->input($bool));
            }
        }

        // Replace cover image if new one uploaded
        if ($request->hasFile('cover_image')) {
            if ($track->cover_r2_key) {
                $this->storage->delete($track->cover_r2_key);
            }
            $coverKey = $this->storage->storeImage($request->file('cover_image'), 'music/covers');
            $updates['cover_r2_key'] = $coverKey;
            $updates['cover_url']    = $this->storage->url($coverKey);
        }

        $track->update($updates);
        return response()->json(['success' => true, 'data' => $track->fresh()]);
    }

    // ── Destroy ───────────────────────────────────────────────────────────────

    public function destroy(int $id): JsonResponse
    {
        $track = MusicTrack::findOrFail($id);

        $this->storage->delete($track->audio_r2_key);
        $this->storage->delete($track->cover_r2_key);

        $track->delete();
        return response()->json(['success' => true, 'message' => 'Track deleted.']);
    }

    // ── Status actions ────────────────────────────────────────────────────────

    public function publish(int $id): JsonResponse
    {
        $track = MusicTrack::findOrFail($id);
        $track->update(['status' => 'published']);
        return response()->json(['success' => true, 'data' => $track->fresh()]);
    }

    public function unpublish(int $id): JsonResponse
    {
        $track = MusicTrack::findOrFail($id);
        $track->update(['status' => 'draft']);
        return response()->json(['success' => true, 'data' => $track->fresh()]);
    }

    public function duplicate(int $id): JsonResponse
    {
        $track   = MusicTrack::findOrFail($id);
        $newData = $track->toArray();
        unset($newData['id'], $newData['created_at'], $newData['updated_at']);
        $newData['title']               = $newData['title'] . ' (Copy)';
        $newData['status']              = 'draft';
        $newData['plays_count']         = 0;
        $newData['uses_count']          = 0;
        $newData['downloads_count']     = 0;
        $newData['created_by_admin_id'] = Auth::id();

        $clone = MusicTrack::create($newData);
        return response()->json(['success' => true, 'data' => $clone], 201);
    }

    // ── Stats ─────────────────────────────────────────────────────────────────

    public function stats(): JsonResponse
    {
        return response()->json(['success' => true, 'data' => $this->getStats()]);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function parseJsonField(mixed $value): mixed
    {
        if (is_array($value)) return $value;
        if (is_string($value) && str_starts_with($value, '[')) {
            return json_decode($value, true) ?? null;
        }
        return null;
    }
}
