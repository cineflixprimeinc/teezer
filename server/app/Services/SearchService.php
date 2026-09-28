<?php

namespace App\Services;

use App\Models\AudioTrack;
use App\Models\Hashtag;
use App\Models\User;
use App\Models\Video;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * Full-text search backed by Typesense.
 *
 * The service is the single integration point for search across the site
 * (users, videos, hashtags, sounds). It degrades gracefully:
 *   - if the typesense-php package isn't installed, or
 *   - if the Typesense server is unreachable,
 * search falls back to MySQL LIKE queries and indexing becomes a no-op, so
 * registration / upload / feed are never blocked by a search outage.
 */
class SearchService
{
    private ?object $client = null;

    /** Which document fields each collection searches over (Typesense query_by). */
    private const QUERY_BY = [
        'users'    => 'name,username,bio',
        'videos'   => 'caption,title,username,hashtags',
        'hashtags' => 'tag',
        'sounds'   => 'title,artist',
    ];

    public function __construct()
    {
        // Only build a client when the package is present. No hard dependency,
        // so the app boots fine before `composer require typesense/typesense-php`.
        if (class_exists(\Typesense\Client::class)) {
            try {
                $this->client = new \Typesense\Client([
                    'api_key' => config('services.typesense.key'),
                    'nodes'   => [[
                        'host'     => config('services.typesense.host', '127.0.0.1'),
                        'port'     => config('services.typesense.port', '8108'),
                        'protocol' => config('services.typesense.protocol', 'http'),
                    ]],
                    'connection_timeout_seconds' => 2,
                ]);
            } catch (\Throwable $e) {
                Log::warning('Typesense client init failed: ' . $e->getMessage());
                $this->client = null;
            }
        }
    }

    /** True only when a Typesense client is available. */
    private function available(): bool
    {
        return $this->client !== null;
    }

    // ── Collection setup ─────────────────────────────────────────────────────
    // Typesense needs an explicit, typed schema. setup() (re)creates each
    // collection cleanly; follow it with `search:sync` to repopulate.

    public function setupIndexes(): void
    {
        if (! $this->available()) return;

        $this->recreateCollection('users', [
            ['name' => 'name',            'type' => 'string'],
            ['name' => 'username',        'type' => 'string'],
            ['name' => 'bio',             'type' => 'string', 'optional' => true],
            ['name' => 'avatar',          'type' => 'string', 'optional' => true],
            ['name' => 'verified',        'type' => 'bool',   'optional' => true],
            ['name' => 'is_banned',       'type' => 'bool',   'optional' => true, 'facet' => true],
            ['name' => 'followers_count', 'type' => 'int32'],
            ['name' => 'category',        'type' => 'string', 'optional' => true],
        ], 'followers_count');

        $this->recreateCollection('videos', [
            ['name' => 'title',         'type' => 'string',   'optional' => true],
            ['name' => 'caption',       'type' => 'string',   'optional' => true],
            ['name' => 'thumbnail_url', 'type' => 'string',   'optional' => true],
            ['name' => 'user_id',       'type' => 'int32',    'optional' => true],
            ['name' => 'username',      'type' => 'string',   'optional' => true],
            ['name' => 'views_count',   'type' => 'int32'],
            ['name' => 'likes_count',   'type' => 'int32',    'optional' => true],
            ['name' => 'hashtags',      'type' => 'string[]', 'optional' => true],
            ['name' => 'created_at',    'type' => 'string',   'optional' => true],
        ], 'views_count');

        $this->recreateCollection('hashtags', [
            ['name' => 'tag',            'type' => 'string'],
            ['name' => 'posts_count',    'type' => 'int32'],
            ['name' => 'trending_score', 'type' => 'int32', 'optional' => true],
        ], 'posts_count');

        $this->recreateCollection('sounds', [
            ['name' => 'title',       'type' => 'string'],
            ['name' => 'artist',      'type' => 'string', 'optional' => true],
            ['name' => 'reels_count', 'type' => 'int32'],
            ['name' => 'cover_image', 'type' => 'string', 'optional' => true],
        ], 'reels_count');
    }

    private function recreateCollection(string $name, array $fields, string $defaultSortingField): void
    {
        try {
            // Drop first so the schema is always current; repopulate via search:sync.
            try { $this->client->collections[$name]->delete(); } catch (\Throwable) { /* didn't exist */ }
            $this->client->collections->create([
                'name'                  => $name,
                'fields'                => $fields,
                'default_sorting_field' => $defaultSortingField,
            ]);
        } catch (\Throwable $e) {
            Log::warning("Typesense setup for '{$name}' failed: " . $e->getMessage());
        }
    }

    // ── Bulk sync ────────────────────────────────────────────────────────────

    public function syncUsers(): int
    {
        if (! $this->available()) return 0;
        $count = 0;
        User::with('profile')
            ->where('is_banned', false)
            ->chunk(500, function ($users) use (&$count) {
                $docs = $users->map(fn ($u) => $this->buildUserDocument($u))->all();
                $count += $this->import('users', $docs);
            });
        return $count;
    }

    public function syncVideos(): int
    {
        if (! $this->available()) return 0;
        $count = 0;
        Video::with(['user', 'hashtags'])
            ->where('status', 'published')
            ->whereNull('deleted_at')
            ->chunk(500, function ($videos) use (&$count) {
                $docs = $videos->map(fn ($v) => $this->buildVideoDocument($v))->all();
                $count += $this->import('videos', $docs);
            });
        return $count;
    }

    public function syncHashtags(): int
    {
        if (! $this->available()) return 0;
        $count = 0;
        Hashtag::chunk(500, function ($hashtags) use (&$count) {
            $docs = $hashtags->map(fn ($h) => $this->buildHashtagDocument($h))->all();
            $count += $this->import('hashtags', $docs);
        });
        return $count;
    }

    public function syncSounds(): int
    {
        if (! $this->available()) return 0;
        $count = 0;
        AudioTrack::chunk(500, function ($tracks) use (&$count) {
            $docs = $tracks->map(fn ($t) => $this->buildSoundDocument($t))->all();
            $count += $this->import('sounds', $docs);
        });
        return $count;
    }

    // ── Single-document upsert / delete ──────────────────────────────────────

    public function upsertUser(User $user): void
    {
        if (! $this->available()) return;
        if ($user->is_banned) { $this->removeUser($user->id); return; }
        $user->loadMissing('profile');
        $this->upsert('users', $this->buildUserDocument($user));
    }

    public function removeUser(int $id): void
    {
        $this->delete('users', $id);
    }

    public function upsertVideo(Video $video): void
    {
        if (! $this->available()) return;
        if ($video->status !== 'published' || $video->deleted_at !== null) {
            $this->removeVideo($video->id); return;
        }
        $video->loadMissing(['user', 'hashtags']);
        $this->upsert('videos', $this->buildVideoDocument($video));
    }

    public function removeVideo(int $id): void
    {
        $this->delete('videos', $id);
    }

    public function upsertHashtag(Hashtag $hashtag): void
    {
        if (! $this->available()) return;
        $this->upsert('hashtags', $this->buildHashtagDocument($hashtag));
    }

    public function removeHashtag(int $id): void
    {
        $this->delete('hashtags', $id);
    }

    public function upsertSound(AudioTrack $track): void
    {
        if (! $this->available()) return;
        $this->upsert('sounds', $this->buildSoundDocument($track));
    }

    public function removeSound(int $id): void
    {
        $this->delete('sounds', $id);
    }

    // ── Low-level Typesense ops (all fail-safe so writes never break) ─────────

    /** @return int number of documents written */
    private function import(string $collection, array $docs): int
    {
        if (! $this->available() || empty($docs)) return 0;
        try {
            $payload = array_map(fn ($d) => $this->prepareForIndex($d), $docs);
            $this->client->collections[$collection]->documents->import($payload, ['action' => 'upsert']);
            return count($payload);
        } catch (\Throwable $e) {
            Log::warning("Typesense import into '{$collection}' failed: " . $e->getMessage());
            return 0;
        }
    }

    private function upsert(string $collection, array $doc): void
    {
        if (! $this->available()) return;
        try {
            $this->client->collections[$collection]->documents->upsert($this->prepareForIndex($doc));
        } catch (\Throwable $e) {
            Log::warning("Typesense upsert into '{$collection}' failed: " . $e->getMessage());
        }
    }

    private function delete(string $collection, int $id): void
    {
        if (! $this->available()) return;
        try {
            $this->client->collections[$collection]->documents[(string) $id]->delete();
        } catch (\Throwable) {
            // 404 (already gone) or transient error - nothing to do.
        }
    }

    /**
     * Prep a document for Typesense: the `id` must be a string, and optional
     * fields must be omitted (not sent as null) or Typesense rejects them.
     */
    private function prepareForIndex(array $doc): array
    {
        $doc = array_filter($doc, fn ($v) => $v !== null);
        $doc['id'] = (string) $doc['id'];
        return $doc;
    }

    // ── Search ───────────────────────────────────────────────────────────────

    /**
     * Search across users, videos, hashtags and sounds.
     * Uses Typesense when available; falls back to MySQL LIKE queries on any
     * outage. Always returns full CDN URLs for avatar / thumbnail / cover.
     *
     * @return array{users?:array,videos?:array,hashtags?:array,sounds?:array}
     */
    public function search(string $query, string $type = 'all', int $limit = 5, ?User $viewer = null): array
    {
        if ($this->available()) {
            try {
                $result = [];
                if (in_array($type, ['all', 'users'])) {
                    $result['users'] = array_map(fn ($d) => array_merge($d, [
                        'id'     => (int) $d['id'],
                        'avatar' => ! empty($d['avatar']) ? $this->url($d['avatar']) : StorageService::defaultAvatarUrl(),
                    ]), $this->query('users', $query, $limit));
                }
                if (in_array($type, ['all', 'videos'])) {
                    $result['videos'] = array_map(fn ($d) => array_merge($d, [
                        'id'            => (int) $d['id'],
                        'thumbnail_url' => ! empty($d['thumbnail_url']) ? $this->url($d['thumbnail_url']) : null,
                    ]), $this->query('videos', $query, $limit));
                }
                if (in_array($type, ['all', 'hashtags'])) {
                    $result['hashtags'] = array_map(fn ($d) => array_merge($d, [
                        'id' => (int) $d['id'],
                    ]), $this->query('hashtags', $query, $limit));
                }
                if (in_array($type, ['all', 'sounds'])) {
                    $result['sounds'] = array_map(fn ($d) => array_merge($d, [
                        'id'          => (int) $d['id'],
                        'cover_image' => ! empty($d['cover_image']) ? $this->url($d['cover_image']) : null,
                    ]), $this->query('sounds', $query, $limit));
                }
                $this->attachRingFlags($result, $viewer);
                return $result;
            } catch (\Throwable $e) {
                Log::warning('Typesense search failed, falling back to DB: ' . $e->getMessage());
                // fall through to DB search below
            }
        }

        $result = $this->dbSearch($query, $type, $limit);
        $this->attachRingFlags($result, $viewer);
        return $result;
    }

    /**
     * Merges has_story/has_unseen into $result['users'] in place, batched via
     * Story::batchRingFlags() - same gradient/seen ring the feed, profile
     * screen and Inbox already draw, now on Search's user results too.
     * No-op without a signed-in viewer or when there are no user results.
     */
    private function attachRingFlags(array &$result, ?User $viewer): void
    {
        if (!$viewer || empty($result['users'])) {
            return;
        }
        $flags = \App\Models\Story::batchRingFlags(array_column($result['users'], 'id'), $viewer);
        $result['users'] = array_map(function ($u) use ($flags) {
            $f = $flags[$u['id']] ?? null;
            $u['has_story']  = $f['has_story'] ?? false;
            $u['has_unseen'] = $f['has_unseen'] ?? false;
            return $u;
        }, $result['users']);
    }

    /** Run one Typesense collection search and return the raw documents. */
    private function query(string $collection, string $query, int $limit): array
    {
        $res = $this->client->collections[$collection]->documents->search([
            'q'        => $query !== '' ? $query : '*',
            'query_by' => self::QUERY_BY[$collection],
            'per_page' => $limit,
            'page'     => 1,
        ]);

        return array_map(fn ($hit) => $hit['document'], $res['hits'] ?? []);
    }

    /**
     * Database-powered search using LIKE queries.
     * Used when Typesense is unavailable.
     */
    private function dbSearch(string $query, string $type, int $limit): array
    {
        $like   = '%' . addcslashes($query, '%_\\') . '%';
        $result = [];

        if (in_array($type, ['all', 'users'])) {
            $users = User::with('profile')
                ->where('is_banned', false)
                ->where(fn ($q) => $q->where('name', 'ilike', $like)->orWhere('username', 'ilike', $like))
                ->limit($limit)
                ->get();

            $result['users'] = $users->map(fn (User $u) => [
                'id'              => $u->id,
                'name'            => $u->name,
                'username'        => $u->username,
                'avatar'          => $u->avatar ? $this->url($u->avatar) : StorageService::defaultAvatarUrl(),
                'verified'        => (bool) $u->is_verified,
                'followers_count' => $u->profile?->total_followers ?? 0,
                'bio'             => $u->bio,
            ])->values()->all();
        }

        if (in_array($type, ['all', 'videos'])) {
            $videos = Video::with('user')
                ->where('status', 'published')
                ->whereNull('deleted_at')
                ->where(fn ($q) => $q->where('title', 'ilike', $like)->orWhere('caption', 'ilike', $like))
                ->limit($limit)
                ->get();

            $result['videos'] = $videos->map(fn (Video $v) => [
                'id'            => $v->id,
                'title'         => $v->title,
                'caption'       => $v->caption,
                'thumbnail_url' => ($k = $this->coverKey($v)) ? $this->url($k) : null,
                'user_id'       => $v->user_id,
                'username'      => $v->user?->username,
                'views_count'   => $v->views_count ?? 0,
                'likes_count'   => $v->likes_count ?? 0,
            ])->values()->all();
        }

        if (in_array($type, ['all', 'hashtags'])) {
            $hashtags = Hashtag::where('name', 'ilike', $like)
                ->orderByDesc('videos_count')
                ->limit($limit)
                ->get();

            $result['hashtags'] = $hashtags->map(fn (Hashtag $h) => [
                'id'          => $h->id,
                'tag'         => $h->name,
                'posts_count' => $h->videos_count ?? 0,
            ])->values()->all();
        }

        if (in_array($type, ['all', 'sounds'])) {
            $sounds = AudioTrack::where('title', 'ilike', $like)
                ->orWhere('artist', 'ilike', $like)
                ->limit($limit)
                ->get();

            $result['sounds'] = $sounds->map(fn (AudioTrack $t) => [
                'id'          => $t->id,
                'title'       => $t->title,
                'artist'      => $t->artist,
                'cover_image' => $t->cover_image ? $this->url($t->cover_image) : null,
                'reels_count' => $t->videos_count ?? 0,
            ])->values()->all();
        }

        return $result;
    }

    /** Resolve a stored object key to a full public URL. */
    private function url(string $key): string
    {
        return Storage::disk(config('filesystems.default', 'local'))->url($key);
    }

    // ── Document builders (shape is the public contract - keep stable) ────────

    private function buildUserDocument(User $user): array
    {
        return [
            'id'              => $user->id,
            'name'            => (string) $user->name,
            'username'        => (string) $user->username,
            'avatar'          => $user->avatar,
            'verified'        => (bool) $user->is_verified,
            'is_banned'       => (bool) $user->is_banned,
            'followers_count' => (int) ($user->profile?->total_followers ?? 0),
            'bio'             => $user->bio,
            'category'        => $user->profile?->category,
        ];
    }

    /**
     * The storage key to show as a post's cover.
     *
     * A photo has no thumbnail and never will: ProcessVideoThumbnail only runs
     * for video, so nothing populates thumbnail_url for one. Search was reading
     * that column alone, so every photo post came back with a null cover and
     * rendered as a blank grey tile in the results - the post was found, it just
     * looked empty.
     *
     * The photo IS a valid cover, so it stands in for the missing thumbnail.
     * Same rule VideoResource already applies for the feed and the profile
     * grids; this is search catching up with it, not a new policy. Kept
     * identical on purpose - if that test changes, both must change together or
     * the same post gets a cover in the feed and none in search.
     */
    private function coverKey(Video $video): ?string
    {
        if ($video->thumbnail_url) {
            return $video->thumbnail_url;
        }

        $isImageMedia = empty($video->media_items)
            && \Illuminate\Support\Str::startsWith($video->mime_type ?? '', 'image/');

        return $isImageMedia ? ($video->video_url ?: null) : null;
    }

    private function buildVideoDocument(Video $video): array
    {
        return [
            'id'            => $video->id,
            'title'         => $video->title,
            'caption'       => $video->caption,
            'thumbnail_url' => $this->coverKey($video),
            'user_id'       => (int) $video->user_id,
            'username'      => $video->user?->username,
            'views_count'   => (int) ($video->views_count ?? 0),
            'likes_count'   => (int) ($video->likes_count ?? 0),
            'hashtags'      => $video->hashtags->pluck('name')->all(),
            'created_at'    => $video->created_at?->toIso8601String(),
        ];
    }

    private function buildHashtagDocument(Hashtag $hashtag): array
    {
        return [
            'id'             => $hashtag->id,
            'tag'            => (string) $hashtag->name,
            'posts_count'    => (int) ($hashtag->videos_count ?? 0),
            'trending_score' => (int) ($hashtag->videos_count ?? 0),
        ];
    }

    private function buildSoundDocument(AudioTrack $track): array
    {
        return [
            'id'          => $track->id,
            'title'       => (string) $track->title,
            'artist'      => $track->artist,
            'reels_count' => (int) ($track->usage_count ?? 0),
            'cover_image' => $track->cover_url,
        ];
    }
}
