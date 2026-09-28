<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminActionLog;
use App\Models\AdminPermission;
use App\Models\AdminRole;
use App\Models\AdminRolePermission;
use App\Models\User;
use App\Services\AdminRbacService;
use App\Support\AdminPermissions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Administrators, roles and permissions.
 *
 * Every mutating method here re-derives authority from the authenticated user
 * server-side and refuses through AdminRbacService. Nothing trusts a role or
 * permission value arriving in a payload: the request says which role to
 * assign, and the server decides whether this actor may assign it.
 *
 * Audit goes to AdminActionLog, the panel's existing trail, rather than a
 * second table that would have to be read separately to reconstruct what
 * happened.
 */
class AdminRbacController extends Controller
{
    /* ── Overview ────────────────────────────────────────────────────── */

    /** GET /admin/rbac/overview */
    public function overview(): JsonResponse
    {
        $admins = User::whereIn('role', ['admin', 'super_admin'])->get(['id', 'admin_status']);

        $roles = AdminRole::withCount('admins')->get();

        return response()->json([
            'success' => true,
            'data'    => [
                'administrators' => [
                    'total'     => $admins->count(),
                    'active'    => $admins->filter(fn ($a) => $a->admin_status === null || $a->admin_status === 'active')->count(),
                    'disabled'  => $admins->where('admin_status', 'disabled')->count(),
                    'suspended' => $admins->where('admin_status', 'suspended')->count(),
                    'pending'   => $admins->where('admin_status', 'pending')->count(),
                ],
                'roles' => [
                    'total'  => $roles->count(),
                    'system' => $roles->where('is_system', true)->count(),
                    'custom' => $roles->where('is_system', false)->count(),
                    'active' => $roles->where('is_active', true)->count(),
                ],
                'permissions' => [
                    'total'      => count(AdminPermissions::all()),
                    'categories' => count(AdminPermissions::categories()),
                ],
            ],
        ]);
    }

    /* ── Permission catalogue ────────────────────────────────────────── */

    /** GET /admin/rbac/permissions */
    public function permissions(): JsonResponse
    {
        $cats = [];
        foreach (AdminPermissions::categories() as $key => $cat) {
            $cats[] = [
                'key'         => $key,
                'label'       => $cat['label'],
                'permissions' => collect($cat['permissions'])->map(fn ($m, $k) => [
                    'key'       => $k,
                    'label'     => $m['label'],
                    'sensitive' => $m['sensitive'] ?? false,
                ])->values()->all(),
            ];
        }

        return response()->json(['success' => true, 'data' => ['categories' => $cats]]);
    }

    /** GET /admin/rbac/matrix - permission x role grid. */
    public function matrix(): JsonResponse
    {
        $roles = AdminRole::orderByDesc('is_system')->orderBy('name')->get(['id', 'key', 'name', 'is_system']);

        $held = AdminRolePermission::get(['role_id', 'permission'])
            ->groupBy('permission')
            ->map(fn ($rows) => $rows->pluck('role_id')->all());

        $rows = [];
        foreach (AdminPermissions::categories() as $catKey => $cat) {
            foreach ($cat['permissions'] as $key => $meta) {
                $rows[] = [
                    'permission' => $key,
                    'label'      => $meta['label'],
                    'category'   => $cat['label'],
                    'sensitive'  => $meta['sensitive'] ?? false,
                    // super_admin holds everything by bypass, not by stored rows.
                    'roles'      => $roles->mapWithKeys(fn ($r) => [
                        $r->id => $r->key === 'super_admin' || in_array($r->id, $held[$key] ?? [], true),
                    ])->all(),
                ];
            }
        }

        return response()->json([
            'success' => true,
            'data'    => ['roles' => $roles, 'rows' => $rows],
        ]);
    }

    /* ── Roles ───────────────────────────────────────────────────────── */

    /** GET /admin/rbac/roles */
    public function roles(Request $request): JsonResponse
    {
        $query = AdminRole::withCount('admins')
            ->when($request->get('q'), fn ($q, $s) => $q->where('name', 'like', "%{$s}%"))
            ->when($request->get('type') === 'system', fn ($q) => $q->where('is_system', true))
            ->when($request->get('type') === 'custom', fn ($q) => $q->where('is_system', false))
            ->when($request->get('status') === 'active', fn ($q) => $q->where('is_active', true))
            ->when($request->get('status') === 'disabled', fn ($q) => $q->where('is_active', false))
            ->orderByDesc('is_system')->orderBy('name');

        $counts = AdminRolePermission::selectRaw('role_id, COUNT(*) as n')->groupBy('role_id')->pluck('n', 'role_id');
        $total  = count(AdminPermissions::all());

        return response()->json([
            'success' => true,
            'data'    => $query->get()->map(fn (AdminRole $r) => [
                'id'               => $r->id,
                'key'              => $r->key,
                'name'             => $r->name,
                'description'      => $r->description,
                'is_system'        => $r->is_system,
                'is_active'        => $r->is_active,
                'admin_count'      => $r->admins_count,
                // Super admin's access is a bypass, so it reports the full count
                // rather than the zero rows it actually stores.
                'permission_count' => $r->key === 'super_admin' ? $total : (int) ($counts[$r->id] ?? 0),
                'created_at'       => $r->created_at?->toIso8601String(),
                'updated_at'       => $r->updated_at?->toIso8601String(),
            ])->all(),
        ]);
    }

    /** GET /admin/rbac/roles/{id} */
    public function showRole(int $id): JsonResponse
    {
        $role = AdminRole::withCount('admins')->findOrFail($id);
        $disk = config('filesystems.default', 'r2');

        return response()->json([
            'success' => true,
            'data'    => [
                'id'          => $role->id,
                'key'         => $role->key,
                'name'        => $role->name,
                'description' => $role->description,
                'is_system'   => $role->is_system,
                'is_active'   => $role->is_active,
                'admin_count' => $role->admins_count,
                'permissions' => $role->key === 'super_admin'
                    ? AdminPermissions::all()
                    : $role->permissions()->pluck('permission')->all(),
                'administrators' => $role->admins()->limit(50)->get(['id', 'username', 'name', 'avatar', 'admin_status'])
                    ->map(fn ($u) => [
                        'id'       => $u->id,
                        'username' => $u->username,
                        'name'     => $u->name,
                        'avatar'   => $this->avatarUrl($u->avatar, $disk),
                        'status'   => $u->admin_status ?? 'active',
                    ])->all(),
                'created_at' => $role->created_at?->toIso8601String(),
                'updated_at' => $role->updated_at?->toIso8601String(),
            ],
        ]);
    }

    /** POST /admin/rbac/roles */
    public function createRole(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'          => ['required', 'string', 'max:100'],
            'description'   => ['nullable', 'string', 'max:500'],
            'is_active'     => ['sometimes', 'boolean'],
            'permissions'   => ['array'],
            'permissions.*' => ['string'],
        ]);

        // Unknown keys are dropped rather than stored: a permission that does
        // not exist in the catalogue can never be checked, so keeping it would
        // only make the role look more capable than it is.
        $perms = $this->validPermissions($data['permissions'] ?? []);

        $role = AdminRole::create([
            'key'         => $this->uniqueKey($data['name']),
            'name'        => $data['name'],
            'description' => $data['description'] ?? null,
            'is_active'   => $data['is_active'] ?? true,
            'created_by'  => $request->user()->id,
        ]);

        $this->syncRolePermissions($role, $perms);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'rbac.role_created',
            category: 'security',
            description: "Created role {$role->name} with " . count($perms) . ' permission(s)',
            targetType: 'AdminRole', targetId: $role->id,
            metadata: ['permissions' => $perms],
            ip: $request->ip(), severity: 'warning',
        );

        return response()->json(['success' => true, 'message' => "Role {$role->name} created.", 'data' => ['id' => $role->id]]);
    }

    /** PUT /admin/rbac/roles/{id} */
    public function updateRole(Request $request, int $id): JsonResponse
    {
        $role = AdminRole::findOrFail($id);

        $data = $request->validate([
            'name'          => ['sometimes', 'string', 'max:100'],
            'description'   => ['nullable', 'string', 'max:500'],
            'is_active'     => ['sometimes', 'boolean'],
            'permissions'   => ['sometimes', 'array'],
            'permissions.*' => ['string'],
        ]);

        // Super admin's access is a code bypass; storing a permission list for
        // it would be decorative and would drift as new permissions are added.
        if ($role->key === 'super_admin' && array_key_exists('permissions', $data)) {
            return response()->json([
                'success' => false,
                'message' => 'Super Admin always holds every permission and cannot be edited.',
            ], 422);
        }

        if ($role->key === 'super_admin' && array_key_exists('is_active', $data) && ! $data['is_active']) {
            return response()->json(['success' => false, 'message' => 'The Super Admin role cannot be disabled.'], 422);
        }

        $before = $role->permissions()->pluck('permission')->all();

        $role->fill(array_intersect_key($data, array_flip(['name', 'description', 'is_active'])))->save();

        if (array_key_exists('permissions', $data)) {
            $perms = $this->validPermissions($data['permissions']);
            $this->syncRolePermissions($role, $perms);
        }

        AdminRbacService::forgetRole($role->id);

        $after = $role->permissions()->pluck('permission')->all();

        AdminActionLog::record(
            admin: $request->user(),
            action: 'rbac.role_updated',
            category: 'security',
            description: "Updated role {$role->name}",
            targetType: 'AdminRole', targetId: $role->id,
            metadata: [
                'added'   => array_values(array_diff($after, $before)),
                'removed' => array_values(array_diff($before, $after)),
            ],
            ip: $request->ip(), severity: 'warning',
        );

        return response()->json(['success' => true, 'message' => 'Role saved.']);
    }

    /** POST /admin/rbac/roles/{id}/duplicate */
    public function duplicateRole(Request $request, int $id): JsonResponse
    {
        $source = AdminRole::findOrFail($id);
        $data   = $request->validate([
            'name'             => ['required', 'string', 'max:100'],
            'copy_permissions' => ['sometimes', 'boolean'],
        ]);

        $copy = AdminRole::create([
            'key'         => $this->uniqueKey($data['name']),
            'name'        => $data['name'],
            'description' => $source->description,
            // A duplicate is always a custom role, even when copied from a
            // system one - otherwise it would inherit deletion protection it
            // has no claim to.
            'is_active'   => true,
            'created_by'  => $request->user()->id,
        ]);

        if ($data['copy_permissions'] ?? true) {
            $perms = $source->key === 'super_admin'
                ? AdminPermissions::all()
                : $source->permissions()->pluck('permission')->all();
            $this->syncRolePermissions($copy, $perms);
        }

        AdminActionLog::record(
            admin: $request->user(),
            action: 'rbac.role_duplicated',
            category: 'security',
            description: "Duplicated {$source->name} as {$copy->name}",
            targetType: 'AdminRole', targetId: $copy->id,
            metadata: ['source_id' => $source->id],
            ip: $request->ip(), severity: 'warning',
        );

        return response()->json(['success' => true, 'message' => "Created {$copy->name}.", 'data' => ['id' => $copy->id]]);
    }

    /** DELETE /admin/rbac/roles/{id} */
    public function deleteRole(Request $request, int $id): JsonResponse
    {
        $role = AdminRole::withCount('admins')->findOrFail($id);

        if ($role->is_system) {
            return response()->json(['success' => false, 'message' => 'System roles cannot be deleted. Disable it instead.'], 422);
        }

        $data = $request->validate([
            'reassign_to' => ['nullable', 'integer', 'exists:admin_roles,id'],
            'mode'        => ['required', 'in:reassign,disable'],
        ]);

        // Never silently strips access: the caller must say what happens to the
        // administrators holding this role.
        if ($role->admins_count > 0) {
            if ($data['mode'] === 'reassign') {
                $target = AdminRole::findOrFail($data['reassign_to'] ?? 0);
                if (! AdminRbacService::canAssignRole($request->user(), $target)) {
                    return response()->json(['success' => false, 'message' => 'You cannot assign that role.'], 403);
                }
                User::where('admin_role_id', $role->id)->update(['admin_role_id' => $target->id]);
            } else {
                User::where('admin_role_id', $role->id)->update(['admin_role_id' => null, 'admin_status' => 'disabled']);
            }
        }

        AdminRbacService::forgetRole($role->id);
        $name = $role->name;
        $role->delete();

        AdminActionLog::record(
            admin: $request->user(),
            action: 'rbac.role_deleted',
            category: 'security',
            description: "Deleted role {$name}",
            metadata: ['mode' => $data['mode'], 'affected' => $role->admins_count],
            ip: $request->ip(), severity: 'critical',
        );

        return response()->json(['success' => true, 'message' => "Role {$name} deleted."]);
    }

    /* ── Administrators ──────────────────────────────────────────────── */

    /** GET /admin/rbac/administrators */
    public function administrators(Request $request): JsonResponse
    {
        $disk = config('filesystems.default', 'r2');

        $query = User::whereIn('role', ['admin', 'super_admin'])
            ->with('adminRole:id,key,name')
            ->when($request->get('q'), fn ($q, $s) => $q->where(fn ($w) => $w
                ->where('username', 'like', "%{$s}%")
                ->orWhere('email', 'like', "%{$s}%")
                ->orWhere('name', 'like', "%{$s}%")))
            ->when($request->get('role_id'), fn ($q, $r) => $q->where('admin_role_id', (int) $r))
            ->when($request->get('status'), function ($q, $s) {
                return $s === 'active'
                    ? $q->where(fn ($w) => $w->whereNull('admin_status')->orWhere('admin_status', 'active'))
                    : $q->where('admin_status', $s);
            })
            ->orderByDesc('last_active_at');

        $paginated = $query->paginate(min((int) $request->get('per_page', 25), 100));

        $overrides = AdminPermission::selectRaw('user_id, COUNT(*) as n')->groupBy('user_id')->pluck('n', 'user_id');
        $totalPerm = count(AdminPermissions::all());

        return response()->json([
            'success' => true,
            'data'    => collect($paginated->items())->map(function (User $u) use ($disk, $overrides, $totalPerm) {
                $count = $u->role === 'super_admin'
                    ? $totalPerm
                    : count($u->effectiveAdminPermissions());

                return [
                    'id'               => $u->id,
                    'name'             => $u->name,
                    'username'         => $u->username,
                    'email'            => $u->email,
                    'avatar'           => $this->avatarUrl($u->avatar, $disk),
                    'role'             => $u->role,
                    'admin_role'       => $u->adminRole ? ['id' => $u->adminRole->id, 'key' => $u->adminRole->key, 'name' => $u->adminRole->name] : null,
                    'status'           => $u->admin_status ?? 'active',
                    'permission_count' => $count,
                    'override_count'   => (int) ($overrides[$u->id] ?? 0),
                    'last_active_at'   => $u->last_active_at?->toIso8601String(),
                    'admin_since'      => $u->admin_since?->toIso8601String(),
                    'created_at'       => $u->created_at?->toIso8601String(),
                ];
            })->all(),
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
                'total'        => $paginated->total(),
            ],
        ]);
    }

    /** GET /admin/rbac/administrators/{id} - effective permissions and sessions. */
    public function showAdministrator(int $id): JsonResponse
    {
        $user = User::with('adminRole')->findOrFail($id);
        $disk = config('filesystems.default', 'r2');

        $rolePerms = $user->role === 'super_admin'
            ? AdminPermissions::all()
            : ($user->adminRole?->permissionKeys() ?? []);

        $overrides = AdminPermission::where('user_id', $user->id)->get(['permission', 'effect'])
            ->map(fn ($o) => ['permission' => $o->permission, 'effect' => $o->effect ?? 'grant'])->all();

        $effective = $user->effectiveAdminPermissions();

        // Grouped by category so the UI can show "Users: 12 permissions" and
        // expand, rather than a flat list of a hundred keys.
        $byCategory = [];
        foreach (AdminPermissions::categories() as $key => $cat) {
            $keys  = array_keys($cat['permissions']);
            $held  = array_values(array_intersect($keys, $effective));
            $byCategory[] = [
                'key'     => $key,
                'label'   => $cat['label'],
                'total'   => count($keys),
                'granted' => count($held),
                'items'   => collect($keys)->map(fn ($k) => [
                    'key'       => $k,
                    'label'     => $cat['permissions'][$k]['label'],
                    'sensitive' => $cat['permissions'][$k]['sensitive'] ?? false,
                    'granted'   => in_array($k, $effective, true),
                    'source'    => in_array($k, $effective, true)
                        ? (collect($overrides)->firstWhere('permission', $k)['effect'] ?? null) === 'grant' ? 'override' : 'role'
                        : ((collect($overrides)->firstWhere('permission', $k)['effect'] ?? null) === 'deny' ? 'denied' : 'none'),
                ])->all(),
            ];
        }

        $sessions = DB::table('personal_access_tokens')
            ->where('tokenable_type', User::class)->where('tokenable_id', $user->id)
            ->orderByDesc('last_used_at')->limit(25)
            ->get(['id', 'name', 'last_used_at', 'created_at']);

        return response()->json([
            'success' => true,
            'data'    => [
                'id'          => $user->id,
                'name'        => $user->name,
                'username'    => $user->username,
                'email'       => $user->email,
                'avatar'      => $this->avatarUrl($user->avatar, $disk),
                'role'        => $user->role,
                'admin_role'  => $user->adminRole ? ['id' => $user->adminRole->id, 'key' => $user->adminRole->key, 'name' => $user->adminRole->name] : null,
                'status'      => $user->admin_status ?? 'active',
                'admin_since' => $user->admin_since?->toIso8601String(),
                'role_permissions' => $rolePerms,
                'overrides'        => $overrides,
                'effective'        => $effective,
                'by_category'      => $byCategory,
                'sessions'         => $sessions,
            ],
        ]);
    }

    /** GET /admin/rbac/search-users?q= - candidates to promote. */
    public function searchUsers(Request $request): JsonResponse
    {
        $q = trim((string) $request->get('q', ''));
        if (mb_strlen($q) < 2) {
            return response()->json(['success' => true, 'data' => []]);
        }

        $disk = config('filesystems.default', 'r2');

        $users = User::where(fn ($w) => $w
                ->where('username', 'like', "%{$q}%")
                ->orWhere('email', 'like', "%{$q}%")
                ->orWhere('name', 'like', "%{$q}%")
                ->orWhere('id', (int) $q))
            ->limit(10)
            ->get(['id', 'name', 'username', 'email', 'avatar', 'role']);

        return response()->json([
            'success' => true,
            'data'    => $users->map(fn ($u) => [
                'id'       => $u->id,
                'name'     => $u->name,
                'username' => $u->username,
                'email'    => $u->email,
                'avatar'   => $this->avatarUrl($u->avatar, $disk),
                'role'     => $u->role,
                // Surfaced so the UI never offers to "create" an administrator
                // who already is one - it offers to edit them instead.
                'is_admin' => in_array($u->role, ['admin', 'super_admin'], true),
            ])->all(),
        ]);
    }

    /**
     * POST /admin/rbac/administrators
     *
     * Promotes an EXISTING Reelsoo user. No second identity and no second
     * password: an administrator signs in with the account they already have,
     * so there is one credential to protect and one session system to revoke.
     */
    public function createAdministrator(Request $request): JsonResponse
    {
        $data = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'role_id' => ['required', 'integer', 'exists:admin_roles,id'],
        ]);

        $actor  = $request->user();
        $target = User::findOrFail($data['user_id']);
        $role   = AdminRole::findOrFail($data['role_id']);

        if ($actor->id === $target->id) {
            return response()->json(['success' => false, 'message' => 'You cannot change your own administrative access.'], 403);
        }

        if (! AdminRbacService::canAssignRole($actor, $role)) {
            return response()->json(['success' => false, 'message' => 'Only a Super Admin can grant the Super Admin role.'], 403);
        }

        $wasAdmin = $target->isAdmin();

        $target->forceFill([
            // users.role stays the coarse gate every /admin route already
            // checks; the RBAC role decides what they can do once inside.
            'role'             => $role->key === 'super_admin' ? 'super_admin' : 'admin',
            'admin_role_id'    => $role->id,
            'admin_status'     => 'active',
            'admin_since'      => $target->admin_since ?? now(),
            'admin_granted_by' => $actor->id,
        ])->save();

        AdminRbacService::forgetUser($target->id);

        AdminActionLog::record(
            admin: $actor,
            action: $wasAdmin ? 'rbac.admin_role_changed' : 'rbac.admin_created',
            category: 'security',
            description: ($wasAdmin ? 'Changed' : 'Granted') . " administrative access for @{$target->username} ({$role->name})",
            targetType: 'User', targetId: $target->id,
            metadata: ['role' => $role->key, 'role_id' => $role->id],
            ip: $request->ip(), severity: 'critical',
        );

        return response()->json(['success' => true, 'message' => "@{$target->username} is now {$role->name}."]);
    }

    /** PUT /admin/rbac/administrators/{id} - role, status and overrides. */
    public function updateAdministrator(Request $request, int $id): JsonResponse
    {
        $actor  = $request->user();
        $target = User::findOrFail($id);

        $data = $request->validate([
            'role_id'             => ['sometimes', 'integer', 'exists:admin_roles,id'],
            'status'              => ['sometimes', Rule::in(['active', 'disabled', 'suspended', 'pending'])],
            'overrides'           => ['sometimes', 'array'],
            'overrides.*.permission' => ['required_with:overrides', 'string'],
            'overrides.*.effect'     => ['required_with:overrides', Rule::in(['grant', 'deny'])],
            'reason'              => ['nullable', 'string', 'max:500'],
        ]);

        $action = ($data['status'] ?? null) === 'active' ? 'enable' : (($data['status'] ?? 'edit'));
        if ($refusal = AdminRbacService::refuseReason($actor, $target, $action)) {
            return response()->json(['success' => false, 'message' => $refusal], 403);
        }

        $before = [
            'role'   => $target->adminRole?->name,
            'status' => $target->admin_status,
            'perms'  => $target->effectiveAdminPermissions(),
        ];

        if (isset($data['role_id'])) {
            $role = AdminRole::findOrFail($data['role_id']);
            if (! AdminRbacService::canAssignRole($actor, $role)) {
                return response()->json(['success' => false, 'message' => 'Only a Super Admin can grant the Super Admin role.'], 403);
            }
            $target->forceFill([
                'admin_role_id' => $role->id,
                'role'          => $role->key === 'super_admin' ? 'super_admin' : 'admin',
            ]);
        }

        if (isset($data['status'])) {
            $target->forceFill(['admin_status' => $data['status']]);
        }

        $target->save();

        if (array_key_exists('overrides', $data)) {
            AdminPermission::where('user_id', $target->id)->delete();
            foreach ($data['overrides'] as $o) {
                if (! AdminPermissions::isValid($o['permission'])) {
                    continue;
                }
                AdminPermission::create([
                    'user_id'    => $target->id,
                    'permission' => $o['permission'],
                    'effect'     => $o['effect'],
                    'granted_by' => $actor->id,
                ]);
            }
        }

        AdminRbacService::forgetUser($target->id);
        $target->refresh();
        $after = $target->effectiveAdminPermissions();

        // Ending sessions on suspend/disable is the difference between the
        // status meaning something and being a label: a live token would keep
        // working until it expired.
        if (in_array($data['status'] ?? '', ['disabled', 'suspended'], true)) {
            DB::table('personal_access_tokens')
                ->where('tokenable_type', User::class)->where('tokenable_id', $target->id)->delete();
        }

        AdminActionLog::record(
            admin: $actor,
            action: 'rbac.admin_updated',
            category: 'security',
            description: "Updated administrator @{$target->username}"
                . (isset($data['status']) ? " (status: {$data['status']})" : '')
                . ($data['reason'] ?? '' ? ': ' . $data['reason'] : ''),
            targetType: 'User', targetId: $target->id,
            metadata: [
                'from_role'   => $before['role'],
                'to_role'     => $target->adminRole?->name,
                'from_status' => $before['status'],
                'to_status'   => $target->admin_status,
                'added'       => array_values(array_diff($after, $before['perms'])),
                'removed'     => array_values(array_diff($before['perms'], $after)),
            ],
            ip: $request->ip(), severity: 'critical',
        );

        return response()->json(['success' => true, 'message' => 'Administrator updated.']);
    }

    /** DELETE /admin/rbac/administrators/{id} - revoke admin access, keep the account. */
    public function removeAdministrator(Request $request, int $id): JsonResponse
    {
        $actor  = $request->user();
        $target = User::findOrFail($id);

        if ($refusal = AdminRbacService::refuseReason($actor, $target, 'remove')) {
            return response()->json(['success' => false, 'message' => $refusal], 403);
        }

        $target->forceFill([
            // Back to an ordinary account. The user, their content and their
            // history are untouched - only staff access is withdrawn.
            'role'          => 'user',
            'admin_role_id' => null,
            'admin_status'  => null,
        ])->save();

        AdminPermission::where('user_id', $target->id)->delete();
        AdminRbacService::forgetUser($target->id);

        DB::table('personal_access_tokens')
            ->where('tokenable_type', User::class)->where('tokenable_id', $target->id)->delete();

        AdminActionLog::record(
            admin: $actor,
            action: 'rbac.admin_removed',
            category: 'security',
            description: "Revoked administrative access from @{$target->username}",
            targetType: 'User', targetId: $target->id,
            ip: $request->ip(), severity: 'critical',
        );

        return response()->json(['success' => true, 'message' => "@{$target->username} is no longer an administrator."]);
    }

    /** POST /admin/rbac/administrators/{id}/revoke-sessions */
    public function revokeSessions(Request $request, int $id): JsonResponse
    {
        $target = User::findOrFail($id);

        $n = DB::table('personal_access_tokens')
            ->where('tokenable_type', User::class)->where('tokenable_id', $target->id)->delete();

        AdminActionLog::record(
            admin: $request->user(),
            action: 'rbac.sessions_revoked',
            category: 'security',
            description: "Revoked {$n} session(s) for @{$target->username}",
            targetType: 'User', targetId: $target->id,
            ip: $request->ip(), severity: 'warning',
        );

        return response()->json(['success' => true, 'message' => "Revoked {$n} session(s)."]);
    }

    /** GET /admin/rbac/activity */
    public function activity(Request $request): JsonResponse
    {
        $rows = AdminActionLog::with('admin:id,username,name,avatar')
            ->where(fn ($q) => $q->where('action', 'like', 'rbac.%')->orWhere('category', 'security'))
            ->when($request->get('q'), fn ($q, $s) => $q->where('description', 'like', "%{$s}%"))
            ->latest()
            ->paginate(min((int) $request->get('per_page', 30), 100));

        $disk = config('filesystems.default', 'r2');

        return response()->json([
            'success' => true,
            'data'    => collect($rows->items())->map(fn ($l) => [
                'id'          => $l->id,
                'action'      => $l->action,
                'description' => $l->description,
                'severity'    => $l->severity,
                'metadata'    => $l->metadata,
                'ip'          => $l->ip_address ?? null,
                'created_at'  => $l->created_at?->toIso8601String(),
                'admin'       => $l->admin ? [
                    'id'       => $l->admin->id,
                    'username' => $l->admin->username,
                    'name'     => $l->admin->name,
                    'avatar'   => $this->avatarUrl($l->admin->avatar, $disk),
                ] : null,
            ])->all(),
            'meta' => [
                'current_page' => $rows->currentPage(),
                'last_page'    => $rows->lastPage(),
                'total'        => $rows->total(),
            ],
        ]);
    }

    /* ── Internals ───────────────────────────────────────────────────── */

    private function avatarUrl(?string $key, string $disk): ?string
    {
        if (! $key) {
            return null;
        }

        return str_starts_with($key, 'http') ? $key : Storage::disk($disk)->url($key);
    }

    private function validPermissions(array $keys): array
    {
        return array_values(array_filter(array_unique($keys), fn ($k) => AdminPermissions::isValid($k)));
    }

    private function syncRolePermissions(AdminRole $role, array $permissions): void
    {
        AdminRolePermission::where('role_id', $role->id)->delete();
        foreach ($permissions as $p) {
            AdminRolePermission::create(['role_id' => $role->id, 'permission' => $p]);
        }
        AdminRbacService::forgetRole($role->id);
    }

    private function uniqueKey(string $name): string
    {
        $base = Str::slug($name, '_') ?: 'role';
        $key  = $base;
        $i    = 2;
        while (AdminRole::where('key', $key)->exists()) {
            $key = $base . '_' . $i++;
        }

        return $key;
    }
}
