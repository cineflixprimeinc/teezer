<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminActionLog;
use App\Models\AdminPermission;
use App\Models\User;
use App\Support\AdminPermissions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Grant/revoke fine-grained admin permissions (see User::hasAdminGrant() and
 * App\Support\AdminPermissions for the catalog). Restricted to super_admin -
 * matches the ad hoc in-controller role check StudioSettingsController
 * already uses elsewhere (no Gate/Policy convention exists in this codebase
 * to hook into instead - confirmed via recon before writing this).
 */
class AdminPermissionController extends Controller
{
    private function requireSuperAdmin(Request $request): ?JsonResponse
    {
        if ($request->user()?->role !== 'super_admin') {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        return null;
    }

    /** GET /admin/permissions - catalog + every current grant. */
    public function index(Request $request): JsonResponse
    {
        if ($resp = $this->requireSuperAdmin($request)) return $resp;

        $grants = AdminPermission::with('user:id,name,username,email,role')
            ->get()
            ->map(fn (AdminPermission $g) => [
                'user_id'    => $g->user_id,
                'user'       => $g->user ? [
                    'id' => $g->user->id, 'name' => $g->user->name,
                    'username' => $g->user->username, 'email' => $g->user->email,
                    'role' => $g->user->role,
                ] : null,
                'permission' => $g->permission,
                'granted_at' => $g->created_at?->toIso8601String(),
            ]);

        return response()->json([
            'success' => true,
            'data'    => [
                'catalog' => AdminPermissions::catalog(),
                'grants'  => $grants,
            ],
        ]);
    }

    /** POST /admin/users/{id}/permissions - body: { permission } */
    public function grant(Request $request, int $id): JsonResponse
    {
        if ($resp = $this->requireSuperAdmin($request)) return $resp;

        $request->validate([
            'permission' => ['required', 'string'],
        ]);
        $permission = $request->input('permission');
        if (!AdminPermissions::isValid($permission)) {
            return response()->json(['success' => false, 'message' => 'Unknown permission.'], 422);
        }

        $target = User::findOrFail($id);
        if ($target->role !== 'admin') {
            return response()->json([
                'success' => false,
                'message' => 'Permissions can only be granted to admin accounts.',
            ], 422);
        }

        $grant = AdminPermission::firstOrCreate(
            ['user_id' => $target->id, 'permission' => $permission],
            ['granted_by' => $request->user()->id],
        );

        AdminActionLog::record(
            admin: $request->user(),
            action: 'grant_permission',
            category: 'settings',
            description: "Granted '{$permission}' to {$target->username}.",
            target: $target,
            metadata: ['permission' => $permission],
            ip: $request->ip(),
        );

        return response()->json(['success' => true, 'data' => $grant]);
    }

    /** DELETE /admin/users/{id}/permissions/{permission} */
    public function revoke(Request $request, int $id, string $permission): JsonResponse
    {
        if ($resp = $this->requireSuperAdmin($request)) return $resp;

        $target = User::findOrFail($id);
        $deleted = AdminPermission::where('user_id', $target->id)
            ->where('permission', $permission)
            ->delete();

        if ($deleted) {
            AdminActionLog::record(
                admin: $request->user(),
                action: 'revoke_permission',
                category: 'settings',
                description: "Revoked '{$permission}' from {$target->username}.",
                target: $target,
                metadata: ['permission' => $permission],
                ip: $request->ip(),
            );
        }

        return response()->json(['success' => true]);
    }
}
