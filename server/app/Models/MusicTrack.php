<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Storage;

class MusicTrack extends Model
{
    protected $fillable = [
        'title', 'artist_name', 'album', 'featuring_artists', 'genre', 'mood',
        'language', 'tags', 'release_date', 'bpm', 'music_key', 'isrc',
        'copyright_owner', 'license_type', 'usage_permissions', 'region_restrictions',
        'commercial_use_allowed', 'creator_safe', 'monetization_safe', 'explicit_content',
        'description', 'lyrics',
        'audio_r2_key', 'audio_url', 'cover_r2_key', 'cover_url',
        'duration', 'file_size', 'format', 'bitrate', 'sample_rate', 'waveform_data',
        'plays_count', 'uses_count', 'downloads_count',
        'status', 'recommended', 'featured',
        'allow_reels', 'allow_stories', 'allow_downloads',
        'show_in_studio', 'show_in_upload_picker',
        'created_by_admin_id',
        'source_type', 'source_video_id',
    ];

    protected $casts = [
        'featuring_artists'      => 'array',
        'tags'                   => 'array',
        'usage_permissions'      => 'array',
        'region_restrictions'    => 'array',
        'waveform_data'          => 'array',
        'release_date'           => 'date:Y-m-d',
        'commercial_use_allowed' => 'boolean',
        'creator_safe'           => 'boolean',
        'monetization_safe'      => 'boolean',
        'explicit_content'       => 'boolean',
        'recommended'            => 'boolean',
        'featured'               => 'boolean',
        'allow_reels'            => 'boolean',
        'allow_stories'          => 'boolean',
        'allow_downloads'        => 'boolean',
        'show_in_studio'         => 'boolean',
        'show_in_upload_picker'  => 'boolean',
        'plays_count'            => 'integer',
        'uses_count'             => 'integer',
        'downloads_count'        => 'integer',
        'duration'               => 'integer',
        'file_size'              => 'integer',
        'bitrate'                => 'integer',
        'sample_rate'            => 'integer',
        'source_video_id'        => 'integer',
    ];

    /**
     * Resolve audio_url: if it's already a full URL return as-is,
     * otherwise treat it as an R2 key and build the CDN URL.
     */
    public function getAudioUrlAttribute(?string $value): ?string
    {
        return $this->resolveCdnUrl($value);
    }

    /**
     * Resolve cover_url: same logic as audio_url.
     */
    public function getCoverUrlAttribute(?string $value): ?string
    {
        return $this->resolveCdnUrl($value);
    }

    private function resolveCdnUrl(?string $value): ?string
    {
        if (!$value) return null;

        if (str_starts_with($value, 'http')) {
            // Rows written before the media origin required a signed token on
            // every path stored a fully-resolved URL here instead of a bare
            // key (SignedFilesystemAdapter::toKey() exists specifically to
            // unwind this - "music cover_url is the main offender"). Passing
            // one of those straight through is now a 403/blank image, since
            // the origin rejects unsigned paths. Only re-sign it if it's OUR
            // media host though - a genuinely external URL (a different host)
            // must be left untouched, since signing it would point at a key
            // that doesn't exist in our bucket.
            // teezer.live is our media host; reelsoo.com hosts are still
            // recognised because the restored database carries legacy rows
            // written under that domain - they are reduced to a key and
            // re-served through our own MEDIA_URL.
            $host = strtolower(parse_url($value, PHP_URL_HOST) ?: '');
            $ours = false;
            foreach (['teezer.live', 'reelsoo.com'] as $domain) {
                if ($host === $domain || str_ends_with($host, '.' . $domain)) {
                    $ours = true;
                    break;
                }
            }
            if (!$ours) {
                return $value;
            }
        }

        return Storage::disk(config('filesystems.default', 'local'))->url($value);
    }

    public function videos(): HasMany
    {
        return $this->hasMany(Video::class, 'music_track_id');
    }

    /** Users who saved this sound. Drives the `is_favorited` flag the sound
     *  browser reads, via withExists rather than a loaded collection. */
    public function favorites(): HasMany
    {
        return $this->hasMany(MusicFavorite::class, 'music_track_id');
    }

    public function usages(): HasMany
    {
        return $this->hasMany(MusicUsage::class, 'track_id');
    }

    public function playLogs(): HasMany
    {
        return $this->hasMany(MusicPlayLog::class, 'track_id');
    }
}
