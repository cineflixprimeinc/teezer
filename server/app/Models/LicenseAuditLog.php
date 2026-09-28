<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Append-only licence history. See the migration for why this is separate from
 * admin_action_logs.
 *
 * LICENSOR-SIDE ONLY - excluded from the marketplace package.
 */
class LicenseAuditLog extends Model
{
    public $timestamps = false;

    public const ACTOR_ADMIN    = 'admin';
    public const ACTOR_CUSTOMER = 'customer';
    public const ACTOR_SYSTEM   = 'system';

    protected $fillable = [
        'license_id', 'actor_type', 'actor_id', 'action',
        'description', 'metadata', 'ip_address', 'severity',
    ];

    protected function casts(): array
    {
        return [
            'metadata'   => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function license(): BelongsTo
    {
        return $this->belongsTo(License::class);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    /**
     * The only way anything in this module writes history.
     *
     * The metadata array is scrubbed of anything that looks like a secret
     * before it is persisted, so a caller cannot accidentally log a plaintext
     * code, key or token even by passing one in. Defence in depth: no caller
     * should be passing one, and if one ever does, this stops it reaching the
     * database.
     */
    public static function record(
        ?int    $licenseId,
        string  $action,
        string  $actorType = self::ACTOR_SYSTEM,
        ?int    $actorId = null,
        string  $description = '',
        array   $metadata = [],
        ?string $ip = null,
        string  $severity = 'info',
    ): self {
        return self::create([
            'license_id'  => $licenseId,
            'actor_type'  => $actorType,
            'actor_id'    => $actorId,
            'action'      => $action,
            'description' => $description,
            'metadata'    => self::scrub($metadata) ?: null,
            'ip_address'  => $ip,
            'severity'    => $severity,
        ]);
    }

    private static function scrub(array $metadata): array
    {
        $forbidden = [
            'purchase_code', 'license_key', 'licence_key', 'key', 'token',
            'signature', 'password', 'secret', 'private_key',
        ];

        foreach (array_keys($metadata) as $field) {
            if (in_array(strtolower((string) $field), $forbidden, true)) {
                unset($metadata[$field]);
            }
        }

        return $metadata;
    }
}
