<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\AdminActionLog;
use App\Models\AppNotification;
use App\Models\CreatorProgress;
use App\Models\User;
use App\Models\VideoReport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use App\Services\StorageService;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class AdminUserController extends Controller
{
    public function __construct(private StorageService $storage) {}

    private function avatarUrl(?string $path): ?string
    {
        if (!$path) return null;
        if (str_starts_with($path, 'http')) return $path;
        try {
            return Storage::disk(config('filesystems.default', 'local'))->url($path);
        } catch (\Throwable) {
            return null;
        }
    }

    public function index(Request $request): JsonResponse
    {
        $query = User::with('profile')
            ->withCount([
                'videos',
                'followers',
                'following',
                'verificationRequests as pending_verif_count' => fn ($q) => $q->where('status', 'pending'),
            ]);

        if ($q = $request->get('q')) {
            $query->where(fn ($b) =>
                $b->where('name', 'ilike', "%{$q}%")
                  ->orWhere('username', 'ilike', "%{$q}%")
                  ->orWhere('email', 'ilike', "%{$q}%")
            );
        }

        if ($role = $request->get('role')) {
            $query->where('role', $role);
        }

        if ($request->get('verified') !== null) {
            $query->where('is_verified', (bool) $request->get('verified'));
        }

        if ($request->get('banned') !== null) {
            $query->where('is_banned', (bool) $request->get('banned'));
        }

        if ($country = $request->get('country')) {
            $query->where('selected_country_code', $country);
        }

        // has_videos filter
        if ($request->get('has_videos') !== null) {
            if ((bool) $request->get('has_videos')) {
                $query->has('videos');
            } else {
                $query->doesntHave('videos');
            }
        }

        // verif_status=pending: has at least one pending verification request
        if ($request->get('verif_status') === 'pending') {
            $query->whereHas('verificationRequests', fn ($q) => $q->where('status', 'pending'));
        }

        // Tab-based status filters
        $status = $request->get('status');
        if ($status === 'active') {
            $query->where('is_active', true)->where('is_banned', false);
        } elseif ($status === 'suspended') {
            $query->where('is_active', false)->where('is_banned', false);
        } elseif ($status === 'banned') {
            $query->where('is_banned', true);
        } elseif ($status === 'verified') {
            $query->where('is_verified', true);
        } elseif ($status === 'admin') {
            $query->where('role', 'admin');
        } elseif ($status === 'reported') {
            $query->whereHas('videos', fn ($q) => $q->whereHas('reports'));
        }

        $sort = match($request->get('sort', 'newest')) {
            'oldest'    => ['created_at', 'asc'],
            'followers' => ['followers_count', 'desc'],
            'videos'    => ['videos_count', 'desc'],
            default     => ['created_at', 'desc'],
        };
        $query->orderBy($sort[0], $sort[1]);

        $paginator = $query->paginate((int) $request->get('per_page', 25));

        $items = collect($paginator->items())->map(fn ($u) => [
            'id'                  => $u->id,
            'name'                => $u->name,
            'username'            => $u->username,
            'email'               => $u->email,
            'avatar'              => $this->avatarUrl($u->avatar),
            'role'                => $u->role,
            'is_verified'         => (bool) $u->is_verified,
            'is_banned'           => (bool) $u->is_banned,
            'is_active'           => (bool) $u->is_active,
            'active_status'       => $u->active_status,
            'followers_count'     => (int) ($u->followers_count ?? 0),
            'videos_count'        => (int) ($u->videos_count ?? 0),
            'reports_count'       => 0,
            'verification_status' => $u->is_verified ? 'verified' : ($u->pending_verif_count > 0 ? 'pending' : 'none'),
            'created_at'          => $u->created_at?->toIso8601String(),
            'updated_at'          => $u->updated_at?->toIso8601String(),
            'selected_country_code' => $u->selected_country_code,
        ]);

        return response()->json([
            'success' => true,
            'data'    => $items,
            'meta'    => [
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
                'total'        => $paginator->total(),
                'per_page'     => $paginator->perPage(),
            ],
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $user = User::with([
            'profile',
            'wallet',
            'devices',
            'verificationRequests' => fn ($q) => $q->latest()->limit(1),
        ])
        ->withCount(['videos', 'followers', 'following'])
        ->findOrFail($id);

        // Content summary
        $contentSummary = [
            'total_videos'      => $user->videos()->count(),
            'published_videos'  => $user->videos()->where('status', 'published')->count(),
            'draft_videos'      => $user->videos()->where('status', 'draft')->count(),
            'private_videos'    => $user->videos()->where('status', 'private')->count(),
            'scheduled_videos'  => $user->videos()->where('status', 'scheduled')->count(),
            'total_views'       => $user->videos()->sum('views_count'),
            'total_likes'       => $user->videos()->sum('likes_count'),
        ];

        // Recent drafts
        $drafts = $user->videos()
            ->whereIn('status', ['draft', 'scheduled'])
            ->latest()
            ->limit(4)
            ->get(['id', 'title', 'status', 'thumbnail_url', 'updated_at']);

        // Recent activity from action logs (about this user)
        $timeline = AdminActionLog::where('target_type', 'user')
            ->where('target_id', $id)
            ->latest()
            ->limit(5)
            ->get();

        // Reports against this user's content
        $reportsReceived = VideoReport::whereHas('video', fn ($q) => $q->where('user_id', $id))
            ->count();

        $reportsOpen = VideoReport::whereHas('video', fn ($q) => $q->where('user_id', $id))
            ->where('status', 'pending')
            ->count();

        return response()->json([
            'success' => true,
            'data'    => array_merge($user->toArray(), [
                'profile'         => $user->profile,
                'wallet'          => $user->wallet,
                'devices'         => $user->devices,
                'verification'    => $user->verificationRequests->first(),
                'content_summary' => $contentSummary,
                'drafts'          => $drafts,
                'timeline'        => $timeline,
                'reports_received'=> $reportsReceived,
                'reports_open'    => $reportsOpen,
            ]),
        ]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $user = User::findOrFail($id);

        $validated = $request->validate([
            'name'     => ['sometimes', 'string', 'max:100'],
            'username' => ['sometimes', 'string', 'max:50', 'unique:users,username,' . $id],
            'email'    => ['sometimes', 'email', 'unique:users,email,' . $id],
            'bio'      => ['nullable', 'string', 'max:500'],
        ]);

        $old = $user->only(array_keys($validated));
        $user->update($validated);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'update_user',
            target: $user,
            description: 'Updated user details',
            metadata: ['old' => $old, 'new' => $validated],
        );

        return response()->json(['success' => true, 'data' => $user->fresh()]);
    }

    public function promote(Request $request, int $id): JsonResponse
    {
        $request->validate(['role' => ['required', 'in:user,creator,admin']]);

        $user = User::findOrFail($id);
        $oldRole = $user->role;
        $user->forceFill(['role' => $request->role])->save();

        // When promoting to creator, initialize creator_progress at Level 1
        // (current_level_id = 2 → 0-indexed Level 1 = Starter Creator).
        // Level 0 is pre-approval only; approved creators must never start there.
        if ($request->role === 'creator' && $oldRole !== 'creator') {
            $existing = CreatorProgress::where('user_id', $user->id)->first();
            if (!$existing) {
                CreatorProgress::create([
                    'user_id'          => $user->id,
                    'current_level_id' => 2, // Level 1 (0-indexed) = Starter Creator
                    'current_xp'       => 0,
                    'total_xp_earned'  => 0,
                ]);
            } elseif ($existing->current_level_id <= 1) {
                // Migrate stuck-at-Level-0 records
                $existing->update(['current_level_id' => 2]);
            }
            // Never downgrade a creator who is already at a higher level
        }

        AdminActionLog::record(
            admin: $request->user(),
            action: 'change_role',
            target: $user,
            description: "Changed role from {$oldRole} to {$request->role}",
            metadata: ['old_role' => $oldRole, 'new_role' => $request->role],
        );

        return response()->json(['success' => true, 'message' => 'Role updated.']);
    }

    public function verify(Request $request, int $id): JsonResponse
    {
        $user = User::findOrFail($id);
        $user->forceFill(['is_verified' => true])->save();

        AppNotification::create([
            'user_id'     => $user->id,
            'actor_id'    => $request->user()->id,
            'type'        => 'verification',
            'entity_type' => 'admin_action',
            'entity_id'   => $id,
            'message'     => '🎉 Congratulations! Your account has been officially verified by Teezer. Your blue verified badge is now live on your profile.',
            'is_read'     => false,
        ]);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'verify_user',
            target: $user,
            description: 'Manually verified user account',
        );

        return response()->json(['success' => true, 'message' => 'User verified.']);
    }

    public function unverify(Request $request, int $id): JsonResponse
    {
        $user = User::findOrFail($id);
        $user->forceFill(['is_verified' => false])->save();

        AppNotification::create([
            'user_id'     => $user->id,
            'actor_id'    => null,
            'type'        => 'system',
            'entity_type' => 'admin_action',
            'entity_id'   => $id,
            'message'     => 'Your verified badge has been removed from your account. Please contact support if you believe this is a mistake.',
            'is_read'     => false,
        ]);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'unverify_user',
            target: $user,
            description: 'Removed verification from user account',
        );

        return response()->json(['success' => true, 'message' => 'Verification removed.']);
    }

    public function warn(Request $request, int $id): JsonResponse
    {
        $request->validate(['reason' => ['required', 'string', 'max:500']]);

        $user = User::findOrFail($id);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'warn_user',
            target: $user,
            description: 'Warning sent: ' . $request->reason,
            severity: 'warning',
        );

        return response()->json(['success' => true, 'message' => 'Warning recorded.']);
    }

    public function resetPassword(Request $request, int $id): JsonResponse
    {
        $user = User::findOrFail($id);
        $newPassword = Str::random(12);
        $user->update(['password' => Hash::make($newPassword)]);
        $user->tokens()->delete();

        AdminActionLog::record(
            admin: $request->user(),
            action: 'reset_password',
            target: $user,
            description: 'Admin reset user password and invalidated all sessions',
            severity: 'warning',
        );

        return response()->json(['success' => true, 'message' => 'Password reset and sessions cleared.']);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = User::findOrFail($id);

        if ($user->role === 'admin') {
            return response()->json(['success' => false, 'message' => 'Cannot delete admin accounts.'], 403);
        }

        $user->tokens()->delete();

        // Delete all stored media before soft-deleting so files don't orphan in
        // the bucket. StorageService::delete covers every configured bucket, so
        // an erasure request stays complete while R2 and B2 are both live.
        $storage = $this->storage;

        if ($user->avatar && !str_starts_with($user->avatar, 'http')) {
            $storage->delete($user->avatar);
        }

        $user->videos()->each(function ($video) use ($storage) {
            // Whole HLS prefix, not just the master key - the ladder is dozens
            // of unsigned segment objects, and an erasure that left them behind
            // would still be streamable to anyone holding a playlist URL.
            \App\Jobs\TranscodeVideoToHls::deleteHlsAssets($video->id);

            $keys = array_filter([
                $video->video_url,
                $video->thumbnail_url,
                $video->captions_file_url,
            ]);
            foreach ($keys as $key) {
                $storage->delete($key);
            }
            if (!empty($video->quality_urls) && is_array($video->quality_urls)) {
                foreach ($video->quality_urls as $url) {
                    if (is_string($url) && $url) $storage->delete($url);
                    elseif (is_array($url) && !empty($url['url'])) $storage->delete($url['url']);
                }
            }
            if (!empty($video->media_items) && is_array($video->media_items)) {
                foreach ($video->media_items as $item) {
                    if (is_array($item) && !empty($item['object_key'])) {
                        $storage->delete($item['object_key']);
                    }
                }
            }
            $video->forceDelete();
        });

        $user->delete();

        AdminActionLog::record(
            admin: $request->user(),
            action: 'delete_user',
            target: $user,
            description: 'Deleted user account and purged all R2 media',
            severity: 'critical',
        );

        return response()->json(['success' => true, 'message' => 'User deleted.']);
    }

    public function suspend(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'reason'        => ['required', 'string', 'max:500'],
            'suspend_until' => ['sometimes', 'nullable', 'date'],
        ]);

        $user = User::findOrFail($id);
        $user->forceFill([
            'is_active'       => false,
            'ban_reason'      => $request->reason,
            'suspended_until' => $request->suspend_until ?? null,
        ])->save();
        $user->tokens()->delete();

        AppNotification::create([
            'user_id'     => $user->id,
            'actor_id'    => null,
            'type'        => 'system',
            'entity_type' => 'admin_action',
            'entity_id'   => $id,
            'message'     => '⚠️ Your account has been suspended. Reason: ' . $request->reason . '. Please contact support if you believe this is a mistake.',
            'is_read'     => false,
        ]);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'suspend_user',
            target: $user,
            description: 'Suspended: ' . $request->reason,
            severity: 'warning',
        );

        return response()->json(['success' => true, 'message' => 'User suspended.']);
    }

    public function unsuspend(Request $request, int $id): JsonResponse
    {
        $user = User::findOrFail($id);
        $user->forceFill(['is_active' => true, 'ban_reason' => null, 'suspended_until' => null])->save();

        AppNotification::create([
            'user_id'     => $user->id,
            'actor_id'    => null,
            'type'        => 'system',
            'entity_type' => 'admin_action',
            'entity_id'   => $id,
            'message'     => '✅ Your account suspension has been lifted. Welcome back to Teezer!',
            'is_read'     => false,
        ]);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'unsuspend_user',
            target: $user,
            description: 'Account suspension lifted',
        );

        return response()->json(['success' => true, 'message' => 'User unsuspended.']);
    }
}
