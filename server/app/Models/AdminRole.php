<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

/**
 * A named set of admin permissions.
 *
 * `key` is stable and is what code may compare against; `name` is display text
 * an operator can rename freely. System roles ship with the product and are
 * protected from deletion - see AdminRbacService for the rules.
 */
class AdminRole extends Model
{
    protected $fillable = ['key', 'name', 'description', 'is_active', 'created_by'];

    protected function casts(): array
    {
        return [
            'is_system' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function permissions()
    {
        return $this->hasMany(AdminRolePermission::class, 'role_id');
    }

    public function admins()
    {
        return $this->hasMany(User::class, 'admin_role_id');
    }

    /** Permission keys this role carries, cached - read on every admin request. */
    public function permissionKeys(): array
    {
        return Cache::remember(
            'admin:role_perms:' . $this->id,
            now()->addMinutes(30),
            fn () => $this->permissions()->pluck('permission')->all()
        );
    }
}
