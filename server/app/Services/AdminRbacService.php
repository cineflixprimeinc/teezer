<?php

namespace App\Services;

use App\Models\AdminRole;
use App\Models\User;
use Illuminate\Support\Facades\Cache;

/**
 * The rules that keep the permission system from being used to escalate out of
 * itself, plus the cache invalidation those rules depend on.
 *
 * Every one of these exists because the alternative is a real failure mode, not
 * because it is tidy:
 *
 *  - A stale permission cache means an administrator keeps access they were
 *    just stripped of. Every write that can change an answer calls forget().
 *  - Without the last-super-admin check, the final owner can remove their own
 *    access and nobody can restore it.
 *  - Without the self-modification check, any administrator holding
 *    roles.assign can promote themselves to Super Admin in one request.
 */
class AdminRbacService
{
    /** Clear one administrator's cached permission set. */
    public static function forgetUser(int $userId): void
    {
        Cache::forget('admin:perms:' . $userId);
    }

    /**
     * Clear a role's cached permissions and those of everyone holding it.
     *
     * Chunked because a popular role can be held by many accounts and this runs
     * inside a request.
     */
    public static function forgetRole(int $roleId): void
    {
        Cache::forget('admin:role_perms:' . $roleId);

        User::where('admin_role_id', $roleId)
            ->select('id')
            ->chunkById(500, function ($users) {
                foreach ($users as $u) {
                    self::forgetUser($u->id);
                }
            });
    }

    /** Super admins currently able to sign in and use their access. */
    public static function activeSuperAdminCount(): int
    {
        return User::where('role', 'super_admin')
            ->where('is_banned', false)
            ->where(fn ($q) => $q->whereNull('admin_status')->orWhere('admin_status', 'active'))
            ->count();
    }

    /**
     * True when this change would remove the last way back into the platform.
     *
     * Reelsoo must always have at least one active Super Admin; without this a
     * single click can leave the install with no administrative recovery path.
     */
    public static function wouldOrphanPlatform(User $target): bool
    {
        return $target->role === 'super_admin' && self::activeSuperAdminCount() <= 1;
    }

    /**
     * Guards on one administrator acting against another.
     *
     * Returns an error string to refuse with, or null to allow.
     */
    public static function refuseReason(User $actor, User $target, string $action): ?string
    {
        if ($actor->id === $target->id) {
            // Editing your own access is how privilege escalation is normally
            // attempted; it is also how an owner locks themselves out by
            // accident. Both are refused.
            return 'You cannot change your own administrative access.';
        }

        // Only a super admin may act on a super admin. Otherwise an ordinary
        // admin holding admins.edit could disable the owner.
        if ($target->role === 'super_admin' && $actor->role !== 'super_admin') {
            return 'Only a Super Admin can modify another Super Admin.';
        }

        if (in_array($action, ['disable', 'suspend', 'remove'], true) && self::wouldOrphanPlatform($target)) {
            return 'Teezer must always have at least one active Super Admin account.';
        }

        return null;
    }

    /**
     * Only a super admin may hand out super admin.
     *
     * Without this, roles.assign is transitively equivalent to owning the
     * platform: grant it to anyone, then have them promote you back.
     */
    public static function canAssignRole(User $actor, ?AdminRole $role): bool
    {
        if ($role && $role->key === 'super_admin' && $actor->role !== 'super_admin') {
            return false;
        }

        return true;
    }
}
