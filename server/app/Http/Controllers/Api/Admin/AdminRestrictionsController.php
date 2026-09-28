<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminActionLog;
use App\Models\AppNotification;
use App\Models\User;
use App\Models\UserAdminRestriction;
use App\Models\UserModerationSetting;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminRestrictionsController extends Controller
{
    private const TYPES = [
        'restrict_uploads',
        'post_approval_required',
        'block_live_access',
        'disable_draft_creation',
        'disable_commenting_on_uploads',
        'disable_commenting_on_others',
        'disable_following_others',
    ];

    public function getRestrictions(int $id): JsonResponse
    {
        User::findOrFail($id);

        $rows   = UserAdminRestriction::where('user_id', $id)->get()->keyBy('restriction_type');
        $result = [];

        foreach (self::TYPES as $type) {
            $row            = $rows->get($type);
            $result[$type]  = [
                'is_active'  => $row ? (bool) $row->is_active : false,
                'expires_at' => $row?->expires_at?->toIso8601String(),
                'reason'     => $row?->reason,
            ];
        }

        return response()->json(['success' => true, 'data' => $result]);
    }

    public function updateRestrictions(Request $request, int $id): JsonResponse
    {
        User::findOrFail($id);

        $validated = $request->validate([
            'restrictions'              => ['required', 'array'],
            'restrictions.*.type'       => ['required', Rule::in(self::TYPES)],
            'restrictions.*.is_active'  => ['required', 'boolean'],
            'restrictions.*.expires_at' => ['nullable', 'date', 'after:now'],
            'restrictions.*.reason'     => ['nullable', 'string', 'max:500'],
        ]);

        $admin       = $request->user();
        $modSettings = UserModerationSetting::forUser($id);
        $changes     = [];

        foreach ($validated['restrictions'] as $item) {
            $type      = $item['type'];
            $isActive  = (bool) $item['is_active'];
            $expiresAt = $isActive ? ($item['expires_at'] ?? null) : null;
            $reason    = $item['reason'] ?? null;

            $existing  = UserAdminRestriction::where('user_id', $id)->where('restriction_type', $type)->first();
            $oldActive = $existing ? (bool) $existing->is_active : false;

            UserAdminRestriction::updateOrCreate(
                ['user_id' => $id, 'restriction_type' => $type],
                [
                    'is_active'           => $isActive,
                    'expires_at'          => $expiresAt,
                    'reason'              => $reason,
                    'updated_by_admin_id' => $admin->id,
                    'created_by_admin_id' => $existing?->created_by_admin_id ?? $admin->id,
                ]
            );

            // Keep UserModerationSetting boolean in sync
            $modCol = UserAdminRestriction::MOD_COLUMN_MAP[$type] ?? null;
            if ($modCol) {
                $modSettings->$modCol = $isActive;
            }

            if ($oldActive !== $isActive) {
                $changes[$type] = $isActive;
                $this->notifyRestrictionChange($id, $type, $isActive, $expiresAt, $reason);
            }
        }

        $modSettings->save();

        AdminActionLog::record(
            admin: $admin,
            action: 'update_content_restrictions',
            target: User::find($id),
            description: 'Updated content restrictions with expiry',
            severity: 'info',
            metadata: ['changes' => $changes],
        );

        // Return updated state
        $rows   = UserAdminRestriction::where('user_id', $id)->get()->keyBy('restriction_type');
        $result = [];

        foreach (self::TYPES as $type) {
            $row           = $rows->get($type);
            $result[$type] = [
                'is_active'  => $row ? (bool) $row->is_active : false,
                'expires_at' => $row?->expires_at?->toIso8601String(),
                'reason'     => $row?->reason,
            ];
        }

        return response()->json(['success' => true, 'data' => $result]);
    }

    private function notifyRestrictionChange(
        int $userId, string $type, bool $isActive, ?string $expiresAt, ?string $reason
    ): void {
        $labels = [
            'restrict_uploads' => [
                true  => 'Your ability to upload content has been restricted.',
                false => 'Your upload restriction has been lifted.',
            ],
            'post_approval_required' => [
                true  => 'Your uploads will now require admin approval before going public.',
                false => 'Admin approval is no longer required for your uploads.',
            ],
            'block_live_access' => [
                true  => 'Your live streaming access has been disabled.',
                false => 'Your live streaming access has been restored.',
            ],
            'disable_draft_creation' => [
                true  => 'Draft creation has been disabled on your account.',
                false => 'Draft creation has been re-enabled on your account.',
            ],
            'disable_commenting_on_uploads' => [
                true  => 'Comments on your uploads have been disabled.',
                false => 'Comments on your uploads have been re-enabled.',
            ],
            'disable_commenting_on_others' => [
                true  => 'Your ability to comment on other users\' content has been disabled.',
                false => 'Your ability to comment on other users\' content has been restored.',
            ],
            'disable_following_others' => [
                true  => 'Your ability to follow other users has been disabled.',
                false => 'Your ability to follow other users has been restored.',
            ],
        ];

        $msg = $labels[$type][$isActive] ?? 'Your account restriction has been updated.';

        if ($isActive && $expiresAt) {
            $date = Carbon::parse($expiresAt)->format('M j, Y');
            $msg .= " This will automatically expire on {$date}.";
        }

        if ($reason) {
            $msg .= " Reason: {$reason}.";
        }

        $msg .= ' - Teezer';

        AppNotification::create([
            'user_id'     => $userId,
            'actor_id'    => null,
            'type'        => 'admin_account_restriction',
            'entity_type' => 'admin_account_update',
            'entity_id'   => $userId,
            'message'     => $msg,
            'is_read'     => false,
        ]);
    }
}
