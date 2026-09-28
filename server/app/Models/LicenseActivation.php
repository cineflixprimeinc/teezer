<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** LICENSOR-SIDE ONLY - excluded from the marketplace package. */
class LicenseActivation extends Model
{
    public const STATUS_ACTIVE   = 'active';
    public const STATUS_RELEASED = 'released';
    public const STATUS_REJECTED = 'rejected';

    protected $fillable = [
        'license_id', 'installation_id', 'domain', 'status', 'ip_address',
        'version', 'php_version', 'server_os', 'user_agent', 'rejection_reason',
        'activated_at', 'last_seen_at', 'released_at',
    ];

    protected function casts(): array
    {
        return [
            'activated_at' => 'datetime',
            'last_seen_at' => 'datetime',
            'released_at'  => 'datetime',
        ];
    }

    public function license(): BelongsTo
    {
        return $this->belongsTo(License::class);
    }
}
