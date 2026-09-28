<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A downloadable release package in the private B2 bucket. Holds an object KEY,
 * never a URL and never a credential - see the migration docblock.
 *
 * LICENSOR-SIDE ONLY - excluded from the marketplace package.
 */
class LicenseRelease extends Model
{
    protected $fillable = [
        'version', 'channel', 'object_key', 'checksum_sha256', 'signature',
        'size_bytes', 'min_upgrade_from', 'release_notes', 'is_published',
        'is_mandatory', 'published_by', 'released_at',
    ];

    /**
     * The object key is infrastructure detail. It grants nothing on its own
     * (the bucket is private) but there is no reason to publish our storage
     * layout to every customer that checks for updates.
     */
    protected $hidden = ['object_key'];

    protected function casts(): array
    {
        return [
            'is_published' => 'boolean',
            'is_mandatory' => 'boolean',
            'released_at'  => 'datetime',
            'size_bytes'   => 'integer',
        ];
    }

    public static function latestPublished(string $channel = 'stable'): ?self
    {
        return self::where('channel', $channel)
            ->where('is_published', true)
            ->orderByDesc('released_at')
            ->orderByDesc('id')
            ->first();
    }
}
