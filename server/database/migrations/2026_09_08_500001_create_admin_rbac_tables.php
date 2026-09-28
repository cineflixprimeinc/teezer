<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Role-based access control for administrators.
 *
 * Extends what already exists rather than replacing it. Today:
 *   users.role            coarse gate - user | creator | admin | super_admin
 *   ApiAdminMiddleware    confirms admin + not banned + 2FA on every /admin route
 *   admin_permissions     per-user grants of a code-defined capability
 *   EnsurePermission      route guard, `permission:xxx`
 *   User::hasAdminGrant() super_admin bypasses; admin consults admin_permissions
 *
 * That works but has no concept of a role carrying a permission set, so every
 * admin had to be granted capabilities one at a time. This adds the missing
 * middle layer and leaves every existing piece in place: users.role still gates
 * entry, admin_permissions still exists (and its rows keep working, now read as
 * per-user overrides), and AdminActionLog remains the single audit trail - no
 * second logging system.
 *
 * Deliberately NOT built: a separate admin identity with its own password.
 * An administrator is an existing Reelsoo user who has been given a role, so
 * there is one login, one session system and one password to protect.
 */
return new class extends Migration
{
    public function up(): void
    {
        /* ── Roles ──────────────────────────────────────────────────────── */
        Schema::create('admin_roles', function (Blueprint $table) {
            $table->id();
            // Stable machine key; the display name can be renamed freely.
            $table->string('key', 60)->unique();
            $table->string('name', 100);
            $table->string('description', 500)->nullable();
            // System roles ship with the product and cannot be deleted.
            $table->boolean('is_system')->default(false);
            $table->boolean('is_active')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['is_active', 'is_system']);
        });

        /* ── Which permissions a role carries ───────────────────────────── */
        Schema::create('admin_role_permissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('role_id')->constrained('admin_roles')->cascadeOnDelete();
            $table->string('permission', 100);
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['role_id', 'permission']);
            $table->index('permission');
        });

        /* ── Assignment + administrative status on the user ─────────────── */
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('admin_role_id')->nullable()->after('role')
                ->constrained('admin_roles')->nullOnDelete();

            /* Separate from users.is_active on purpose. Disabling someone's
               administrative access must leave their ordinary Reelsoo account
               working - they stop being staff, they do not lose their account. */
            $table->string('admin_status', 20)->nullable()->after('admin_role_id');
            $table->timestamp('admin_since')->nullable()->after('admin_status');
            $table->foreignId('admin_granted_by')->nullable()->after('admin_since')
                ->constrained('users')->nullOnDelete();

            $table->index('admin_role_id');
        });

        /* ── Per-user overrides on top of the role ──────────────────────── */
        Schema::table('admin_permissions', function (Blueprint $table) {
            // Existing rows are grants, so that is the default and they keep
            // behaving exactly as before.
            $table->string('effect', 10)->default('grant')->after('permission');
        });

        /* ── Seed the system roles ──────────────────────────────────────── */
        $now  = now();
        $seed = [
            ['key' => 'super_admin',      'name' => 'Super Admin',       'description' => 'Full platform access. Cannot be deleted, and at least one must always remain.'],
            ['key' => 'admin',            'name' => 'Admin',             'description' => 'General platform administrator. Broad access without role or security management.'],
            ['key' => 'moderator',        'name' => 'Moderator',         'description' => 'Content and community moderation. No payments, security or role management.'],
            ['key' => 'support_agent',    'name' => 'Support Agent',     'description' => 'Customer support. Read-heavy access to users and their activity.'],
            ['key' => 'content_manager',  'name' => 'Content Manager',   'description' => 'Content, categories, hashtags and featured placement.'],
            ['key' => 'finance_manager',  'name' => 'Finance Manager',   'description' => 'Payments, payouts, subscriptions and revenue.'],
            ['key' => 'analytics_manager','name' => 'Analytics Manager', 'description' => 'Read-only analytics across the platform.'],
            ['key' => 'developer',        'name' => 'Technical Admin',   'description' => 'System health, logs and integration status.'],
        ];

        foreach ($seed as $i => $r) {
            DB::table('admin_roles')->insertOrIgnore([
                'key'         => $r['key'],
                'name'        => $r['name'],
                'description' => $r['description'],
                'is_system'   => true,
                'is_active'   => true,
                'created_at'  => $now,
                'updated_at'  => $now,
            ]);
        }

        $roleIds = DB::table('admin_roles')->pluck('id', 'key');

        /* Give each seeded role its starting permission set.
           Without this the roles exist but carry nothing, and every
           non-super-admin administrator would be locked out of the very pages
           that could fix it - including this one. super_admin is absent by
           design: it bypasses the check in User::hasAdminGrant() rather than
           storing a list that would go stale as permissions are added. */
        $rows = [];
        foreach (\App\Support\AdminPermissions::systemRoleDefaults() as $key => $perms) {
            if (! isset($roleIds[$key])) {
                continue;
            }
            foreach (array_unique($perms) as $p) {
                $rows[] = ['role_id' => $roleIds[$key], 'permission' => $p, 'created_at' => $now];
            }
        }
        foreach (array_chunk($rows, 500) as $chunk) {
            DB::table('admin_role_permissions')->insertOrIgnore($chunk);
        }

        /* Every existing admin keeps working: map users.role onto the matching
           seeded role and mark them active, so nobody is locked out by this
           migration. */

        DB::table('users')->where('role', 'admin')->update([
            'admin_role_id' => $roleIds['admin'] ?? null,
            'admin_status'  => 'active',
        ]);
        DB::table('users')->where('role', 'super_admin')->update([
            'admin_role_id' => $roleIds['super_admin'] ?? null,
            'admin_status'  => 'active',
        ]);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['admin_role_id']);
            $table->dropForeign(['admin_granted_by']);
            $table->dropIndex(['admin_role_id']);
            $table->dropColumn(['admin_role_id', 'admin_status', 'admin_since', 'admin_granted_by']);
        });

        Schema::table('admin_permissions', function (Blueprint $table) {
            $table->dropColumn('effect');
        });

        Schema::dropIfExists('admin_role_permissions');
        Schema::dropIfExists('admin_roles');
    }
};
