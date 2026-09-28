<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * A recording identified inside an uploaded video.
 *
 * One row per recording, however many videos contain it - the thousandth upload
 * of the same song links to the row the first one created.
 *
 * This is an IDENTIFICATION, not a rights record. That a recording was matched
 * says nothing about who owns it or whether Reelsoo may use it, so nothing here
 * is phrased as ownership and no code should treat it as clearance.
 */
class RecognizedTrack extends Model
{
    use HasFactory;

    protected $fillable = [
        'isrc', 'shazam_id', 'title', 'artist_name', 'album_title', 'artwork_url',
        'apple_music_id', 'apple_music_url', 'shazam_web_url', 'genre', 'explicit', 'source',
    ];

    protected function casts(): array
    {
        return ['explicit' => 'boolean'];
    }

    public function videos()
    {
        return $this->hasMany(Video::class, 'recognized_track_id');
    }

    /**
     * Find the row for this recording, or create it.
     *
     * Identity is ISRC first, then Shazam id - never title+artist, which cannot
     * tell a single from an album cut from a live version.
     *
     * Two uploads of the same song can reach this at the same moment, both find
     * nothing, and both insert. The unique indexes turn that into a duplicate-key
     * error on the loser, which is caught and re-read: the alternative, a
     * transaction or a lock, would serialise every recognition in the app to
     * protect against a collision that is both rare and already handled by the
     * database. Returns null when the provider gave neither identifier, since a
     * row that cannot be matched again would be a new duplicate every time.
     */
    public static function findOrCreateFor(array $data): ?self
    {
        $isrc     = $data['isrc']      ?? null;
        $shazamId = $data['shazam_id'] ?? null;

        if (! $isrc && ! $shazamId) {
            return null;
        }

        if ($existing = self::lookup($isrc, $shazamId)) {
            // Backfill an identifier this provider knew and the first one did
            // not, so the row keeps getting easier to match rather than
            // spawning a sibling later.
            $fill = array_filter([
                'isrc'            => $existing->isrc ?: $isrc,
                'shazam_id'       => $existing->shazam_id ?: $shazamId,
                'apple_music_url' => $existing->apple_music_url ?: ($data['apple_music_url'] ?? null),
                'artwork_url'     => $existing->artwork_url ?: ($data['artwork_url'] ?? null),
            ]);
            if ($fill) {
                $existing->fill($fill)->save();
            }
            return $existing;
        }

        try {
            return self::create([
                'isrc'            => $isrc,
                'shazam_id'       => $shazamId,
                'title'           => $data['title'] ?? 'Unknown title',
                'artist_name'     => $data['artist_name'] ?? 'Unknown artist',
                'album_title'     => $data['album_title'] ?? null,
                'artwork_url'     => $data['artwork_url'] ?? null,
                'apple_music_id'  => $data['apple_music_id'] ?? null,
                'apple_music_url' => $data['apple_music_url'] ?? null,
                'shazam_web_url'  => $data['shazam_web_url'] ?? null,
                'genre'           => $data['genre'] ?? null,
                'explicit'        => (bool) ($data['explicit'] ?? false),
                'source'          => $data['source'] ?? 'shazamkit',
            ]);
        } catch (\Illuminate\Database\QueryException $e) {
            // Somebody inserted the same recording between the lookup and here.
            // Their row is as good as ours would have been.
            if (str_contains(strtolower($e->getMessage()), 'unique') || $e->getCode() === '23505') {
                return self::lookup($isrc, $shazamId);
            }
            throw $e;
        }
    }

    private static function lookup(?string $isrc, ?string $shazamId): ?self
    {
        return self::query()
            ->when($isrc, fn ($q) => $q->orWhere('isrc', $isrc))
            ->when($shazamId, fn ($q) => $q->orWhere('shazam_id', $shazamId))
            ->first();
    }
}
