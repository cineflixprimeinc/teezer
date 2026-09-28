<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Retroactive grant for a gap the original RBAC seeding migration could not
 * have covered: `global_controls.*` was added to AdminPermissions AFTER
 * 2026_09_08_500001_create_admin_rbac_tables.php had already run and seeded
 * every role's starting permission set from a snapshot of
 * AdminPermissions::systemRoleDefaults() taken at THAT time. Adding a
 * category to the catalog later does not retroactively grant it to any
 * role - exactly the lockout the seeding migration's own comment warns
 * about ("every non-super-admin administrator would be locked out of the
 * very pages that could fix it").
 *
 * super_admin needs no row here - it bypasses via User::hasAdminGrant()'s
 * role check, never through this table. Every other role stays as-is:
 * global_controls is a new, sensitive, platform-wide surface, and only the
 * general 'admin' role's default already included the adjacent 'settings'
 * category it now extends.
 */
return new class extends Migration
{
    public function up(): void
    {
        $roleId = DB::table('admin_roles')->where('key', 'admin')->value('id');

        if (! $roleId) {
            return; // fresh install: the seeding migration will pick this up correctly
        }

        $now = now();
        $permissions = array_filter(
            \App\Support\AdminPermissions::systemRoleDefaults()['admin'] ?? [],
            fn (string $p) => str_starts_with($p, 'global_controls.'),
        );

        $rows = array_map(fn (string $p) => [
            'role_id'    => $roleId,
            'permission' => $p,
            'created_at' => $now,
        ], $permissions);

        if ($rows) {
            DB::table('admin_role_permissions')->insertOrIgnore($rows);
        }
    }

    public function down(): void
    {
        $roleId = DB::table('admin_roles')->where('key', 'admin')->value('id');

        if ($roleId) {
            DB::table('admin_role_permissions')
                ->where('role_id', $roleId)
                ->where('permission', 'like', 'global_controls.%')
                ->delete();
        }
    }
};
