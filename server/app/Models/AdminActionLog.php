<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AdminActionLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'admin_id', 'action', 'category',
        'target_type', 'target_id',
        'description', 'metadata',
        'ip_address', 'severity',
    ];

    protected function casts(): array
    {
        return [
            'metadata'   => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function admin()
    {
        return $this->belongsTo(User::class, 'admin_id');
    }

    /**
     * Flexible helper - supports two call signatures:
     *
     * Positional (legacy):
     *   AdminActionLog::record($adminId, 'action', 'category', 'description', 'target_type', $targetId, [...], 'severity', $ip)
     *
     * Named args (modern):
     *   AdminActionLog::record(admin: $user, action: '...', target: $model, description: '...', metadata: [...])
     */
    public static function record(
        int|User|null $admin        = null,
        string        $action       = '',
        string|null   $category     = null,
        string        $description  = '',
        string|null   $targetType   = null,
        int|null      $targetId     = null,
        array         $metadata     = [],
        string        $severity     = 'info',
        string|null   $ip           = null,
        Model|null    $target       = null,
    ): self {
        // Resolve admin ID
        $adminId = $admin instanceof User ? $admin->id : (int) $admin;

        // Resolve target from Model if provided via named arg
        if ($target !== null && $targetType === null) {
            $targetType = class_basename($target);
            $targetId   = $target->getKey();
        }

        // Derive category from action if not provided
        if ($category === null) {
            $category = match(true) {
                str_contains($action, 'user')    => 'user_management',
                str_contains($action, 'video')   => 'content_actions',
                str_contains($action, 'report')  => 'content_actions',
                str_contains($action, 'setting') => 'settings',
                str_contains($action, 'feature') => 'settings',
                str_contains($action, 'verify')  => 'user_management',
                str_contains($action, 'ban')     => 'user_management',
                str_contains($action, 'cms')     => 'settings',
                str_contains($action, 'menu')    => 'settings',
                str_contains($action, 'notif')   => 'notifications',
                default                          => 'general',
            };
        }

        return self::create([
            'admin_id'    => $adminId,
            'action'      => $action,
            'category'    => $category,
            'target_type' => $targetType,
            'target_id'   => $targetId,
            'description' => $description,
            'metadata'    => $metadata ?: null,
            'ip_address'  => $ip,
            'severity'    => $severity,
        ]);
    }
}
