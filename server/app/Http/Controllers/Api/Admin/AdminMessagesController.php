<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminActionLog;
use App\Models\Conversation;
use App\Models\DirectMessage;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use App\Mail\AdminActionMail;
use App\Services\NotificationService;

class AdminMessagesController extends Controller
{
    // ── Stats ─────────────────────────────────────────────────────────────────

    public function stats(): JsonResponse
    {
        $since = now()->subDays(30);

        return response()->json([
            'total_conversations' => Conversation::where('created_at', '>=', $since)->count(),
            'total_messages'      => DirectMessage::where('created_at', '>=', $since)->count(),
            'reported_messages'   => DirectMessage::where('flagged_by_admin', true)
                                        ->where('created_at', '>=', $since)->count(),
            'blocked_users'       => User::where('is_banned', true)
                                        ->where('updated_at', '>=', $since)->count(),
        ]);
    }

    // ── List all conversations (admin view) ───────────────────────────────────
    // Queries direct_messages to find real user pairs (same as frontend),
    // then LEFT JOINs conversations table for admin metadata.
    // This ensures legacy messages (without a conversations row) still appear.

    public function conversations(Request $request): JsonResponse
    {
        $userId = $request->get('user_id');
        $search = $request->get('search');
        $filter = $request->get('filter');
        $page   = max(1, (int) $request->get('page', 1));
        $perPage = 25;

        // Step 1: Find all unique sender/receiver pairs from direct_messages.
        // u1 = LEAST(sender,receiver), u2 = GREATEST - same canonical ordering as the app.
        $pairsQuery = DB::table('direct_messages')
            ->selectRaw('
                LEAST(sender_id, receiver_id)    AS u1,
                GREATEST(sender_id, receiver_id) AS u2,
                MAX(id)          AS last_msg_id,
                MAX(created_at)  AS last_active
            ')
            ->groupByRaw('LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id)');

        if ($userId) {
            $pairsQuery->where(function ($q) use ($userId) {
                $q->where('sender_id', $userId)->orWhere('receiver_id', $userId);
            });
        }

        if ($search) {
            $matchIds = User::where('username', 'ilike', "%{$search}%")
                ->orWhere('name', 'ilike', "%{$search}%")
                ->pluck('id')->all();
            if (empty($matchIds)) {
                return response()->json(['data' => [], 'meta' => ['current_page' => $page, 'last_page' => 1, 'total' => 0]]);
            }
            $pairsQuery->where(function ($q) use ($matchIds) {
                $q->whereIn('sender_id', $matchIds)->orWhereIn('receiver_id', $matchIds);
            });
        }

        $allPairs  = $pairsQuery->orderByDesc('last_active')->get();
        $total     = $allPairs->count();
        $pairs     = $allPairs->forPage($page, $perPage)->values();

        if ($pairs->isEmpty()) {
            return response()->json(['data' => [], 'meta' => ['current_page' => $page, 'last_page' => max(1, (int) ceil($total / $perPage)), 'total' => $total]]);
        }

        // Step 2: Load existing conversation rows for these pairs (for admin metadata).
        $convMap = collect();
        if ($pairs->isNotEmpty()) {
            $orConditions = $pairs->map(fn ($p) => "(user_a_id = {$p->u1} AND user_b_id = {$p->u2})")->implode(' OR ');
            $convMap = Conversation::whereRaw($orConditions)
                ->get()
                ->keyBy(fn ($c) => "{$c->user_a_id}_{$c->user_b_id}");
        }

        // Step 3: Auto-create missing conversation rows so admin actions have a target.
        foreach ($pairs as $pair) {
            $key = "{$pair->u1}_{$pair->u2}";
            if (!$convMap->has($key)) {
                $conv = Conversation::create([
                    'user_a_id'    => $pair->u1,
                    'user_b_id'    => $pair->u2,
                    'initiated_by' => $pair->u1,
                    'received_by'  => $pair->u2,
                    'status'       => 'approved',
                    'approved_at'  => now(),
                ]);
                $convMap->put($key, $conv);
            }
        }

        // Step 4: Load users, last messages, counts.
        $allUserIds = $pairs->flatMap(fn ($p) => [$p->u1, $p->u2])->unique()->values()->all();
        $users      = User::whereIn('id', $allUserIds)
            ->select('id', 'username', 'name', 'avatar', 'last_active_at', 'is_banned')
            ->get()->keyBy('id');

        $lastMsgIds  = $pairs->pluck('last_msg_id')->filter()->all();
        $lastMsgMap  = DirectMessage::whereIn('id', $lastMsgIds)
            ->select('id', 'sender_id', 'receiver_id', 'body', 'message_type', 'created_at')
            ->get()->keyBy('id');

        $convIds = $convMap->pluck('id')->filter()->all();
        $unreadCounts = $flaggedCounts = collect();
        if (!empty($convIds)) {
            $unreadCounts  = DirectMessage::whereIn('conversation_id', $convIds)
                ->whereNull('read_at')->whereNull('deleted_for_everyone_at')
                ->selectRaw('conversation_id, COUNT(*) as cnt')->groupBy('conversation_id')
                ->pluck('cnt', 'conversation_id');
            $flaggedCounts = DirectMessage::whereIn('conversation_id', $convIds)
                ->where('flagged_by_admin', true)
                ->selectRaw('conversation_id, COUNT(*) as cnt')->groupBy('conversation_id')
                ->pluck('cnt', 'conversation_id');
        }

        // Step 5: Build response items (apply filter after metadata is loaded).
        $items = $pairs->map(function ($pair) use ($convMap, $users, $lastMsgMap, $unreadCounts, $flaggedCounts, $filter) {
            $key  = "{$pair->u1}_{$pair->u2}";
            $conv = $convMap->get($key);

            // Apply admin filters (require a flagged/reported/muted conversation).
            if ($filter === 'flagged'  && !$conv?->flagged_at)         return null;
            if ($filter === 'reported' && $conv?->report_status !== 'open') return null;
            if ($filter === 'muted'    && !$conv?->admin_muted_at)     return null;

            $last    = $lastMsgMap->get($pair->last_msg_id);
            $userA   = $users->get($pair->u1);
            $userB   = $users->get($pair->u2);
            $convId  = $conv?->id ?? 0;

            return [
                'id'             => $convId,
                'status'         => $conv?->status ?? 'approved',
                'report_status'  => $conv?->report_status,
                'risk_level'     => $conv?->risk_level,
                'flagged_at'     => $conv?->flagged_at instanceof \Carbon\Carbon ? $conv->flagged_at->toISOString() : $conv?->flagged_at,
                'shadow_restricted'         => (bool) $conv?->shadow_restricted,
                'dm_restricted'             => (bool) $conv?->dm_restricted,
                'message_approval_required' => (bool) $conv?->message_approval_required,
                'links_disabled'            => (bool) $conv?->links_disabled,
                'media_restricted'          => (bool) $conv?->media_restricted,
                'prevent_new_requests'      => (bool) $conv?->prevent_new_requests,
                'auto_hide_reported'        => (bool) $conv?->auto_hide_reported,
                'history_archived'          => (bool) $conv?->history_archived,
                'auto_delete_flagged'       => $conv?->auto_delete_flagged,
                'admin_closed_at'           => $conv?->admin_closed_at instanceof \Carbon\Carbon ? $conv->admin_closed_at->toISOString() : $conv?->admin_closed_at,
                'admin_muted_at'            => $conv?->admin_muted_at instanceof \Carbon\Carbon ? $conv->admin_muted_at->toISOString() : $conv?->admin_muted_at,
                'updated_at'     => $pair->last_active,
                'user_a'         => $this->formatUser($userA),
                'user_b'         => $this->formatUser($userB),
                'last_message'   => $last ? [
                    'id'           => $last->id,
                    'body'         => $last->body,
                    'message_type' => $last->message_type,
                    'sender_id'    => $last->sender_id,
                    'created_at'   => $last->created_at instanceof \Carbon\Carbon ? $last->created_at->toISOString() : (string) $last->created_at,
                ] : null,
                'unread_count'   => (int) ($unreadCounts[$convId] ?? 0),
                'flagged_count'  => (int) ($flaggedCounts[$convId] ?? 0),
            ];
        })->filter()->values();

        return response()->json([
            'data' => $items,
            'meta' => [
                'current_page' => $page,
                'last_page'    => max(1, (int) ceil($total / $perPage)),
                'total'        => $total,
            ],
        ]);
    }

    // ── Get messages in a conversation - NEVER updates read_at ───────────────

    public function messages(Request $request, int $conversationId): JsonResponse
    {
        $conversation = Conversation::with([
            'userA:id,username,name,avatar,last_active_at,is_banned',
            'userB:id,username,name,avatar,last_active_at,is_banned',
        ])->findOrFail($conversationId);

        // Query messages by both conversation_id AND the raw sender/receiver pair
        // so legacy messages (no conversation_id set) are also included.
        $ua = $conversation->user_a_id;
        $ub = $conversation->user_b_id;

        $messages = DirectMessage::with('sender:id,username,name,avatar')
            ->where(function ($q) use ($conversationId, $ua, $ub) {
                $q->where('conversation_id', $conversationId)
                  ->orWhere(function ($q2) use ($ua, $ub) {
                      $q2->whereIn('sender_id', [$ua, $ub])
                         ->whereIn('receiver_id', [$ua, $ub]);
                  });
            })
            ->orderBy('created_at')
            ->paginate(60);

        return response()->json([
            'conversation' => [
                'id'            => $conversation->id,
                'status'        => $conversation->status,
                'report_status' => $conversation->report_status,
                'risk_level'    => $conversation->risk_level,
                'flagged_at'    => $conversation->flagged_at?->toISOString(),
                'shadow_restricted'         => (bool) $conversation->shadow_restricted,
                'dm_restricted'             => (bool) $conversation->dm_restricted,
                'message_approval_required' => (bool) $conversation->message_approval_required,
                'links_disabled'            => (bool) $conversation->links_disabled,
                'media_restricted'          => (bool) $conversation->media_restricted,
                'prevent_new_requests'      => (bool) $conversation->prevent_new_requests,
                'auto_hide_reported'        => (bool) $conversation->auto_hide_reported,
                'history_archived'          => (bool) $conversation->history_archived,
                'auto_delete_flagged'       => $conversation->auto_delete_flagged,
                'admin_closed_at'           => $conversation->admin_closed_at?->toISOString(),
                'admin_muted_at'            => $conversation->admin_muted_at?->toISOString(),
                'restrictions_config'       => $conversation->restrictions_config ?? [],
                'admin_note'                => $conversation->admin_note,
                'updated_at'                => $conversation->updated_at?->toISOString(),
                'user_a'        => $this->formatUser($conversation->userA),
                'user_b'        => $this->formatUser($conversation->userB),
            ],
            'messages' => $messages->map(fn (DirectMessage $m) => $this->formatMessage($m))->values(),
            'meta' => [
                'current_page' => $messages->currentPage(),
                'last_page'    => $messages->lastPage(),
                'total'        => $messages->total(),
            ],
        ]);
    }

    // ── Conversation activity log ─────────────────────────────────────────────

    public function activity(int $conversationId): JsonResponse
    {
        $logs = DB::table('conversation_admin_logs')
            ->where('conversation_id', $conversationId)
            ->orderByDesc('created_at')
            ->limit(30)
            ->get();

        return response()->json(['data' => $logs]);
    }

    // ── Restriction field → human label map ──────────────────────────────────

    private const RESTRICTION_LABELS = [
        'shadow_restricted'          => 'Shadow Restriction',
        'dm_restricted'              => 'DM Restriction',
        'message_approval_required'  => 'Message Approval Required',
        'links_disabled'             => 'Links Disabled',
        'media_restricted'           => 'Media Restriction',
        'prevent_new_requests'       => 'New DM Requests Blocked',
        'auto_hide_reported'         => 'Auto-hide Reported Messages',
        'history_archived'           => 'Message History Archived',
    ];

    // ── Update conversation settings (always notifies on restriction changes) ─

    public function updateSettings(Request $request, int $conversationId): JsonResponse
    {
        $conversation = Conversation::with(['userA', 'userB'])->findOrFail($conversationId);
        $admin        = $request->user();

        $allowed = [
            'report_status', 'risk_level', 'admin_note',
            'shadow_restricted', 'dm_restricted', 'message_approval_required',
            'links_disabled', 'media_restricted', 'prevent_new_requests',
            'auto_hide_reported', 'history_archived', 'auto_delete_flagged',
        ];

        $data = $request->only($allowed);

        // Merge per-restriction expiry dates into restrictions_config JSON
        $expiryMap   = $request->input('restrictions_config', []);
        $currentConf = $conversation->restrictions_config ?? [];
        if (!empty($expiryMap)) {
            $data['restrictions_config'] = array_merge($currentConf, $expiryMap);
        }

        // Detect which boolean restrictions actually changed BEFORE saving
        $changedRestrictions = [];
        foreach (array_keys(self::RESTRICTION_LABELS) as $field) {
            if (array_key_exists($field, $data) && (bool) $data[$field] !== (bool) $conversation->$field) {
                $changedRestrictions[$field] = (bool) $data[$field];
            }
        }

        $conversation->fill($data)->save();
        $adminNote    = $conversation->admin_note;
        $targetUserId = $request->input('target_user_id');

        // Notify participants on restriction changes
        // If admin selected a specific target user, notify only them; otherwise notify both.
        foreach ($changedRestrictions as $field => $enabled) {
            $label      = self::RESTRICTION_LABELS[$field];
            $expiresAt  = ($data['restrictions_config'] ?? [])[$field] ?? null;
            $description = $enabled
                ? "Teezer has applied a messaging restriction to your account: {$label}. Please review our community guidelines."
                : "A messaging restriction has been lifted from your account: {$label}.";

            if ($targetUserId) {
                $targetUser = $targetUserId == $conversation->user_a_id ? $conversation->userA : $conversation->userB;
                $this->notifyUser(
                    user:        $targetUser,
                    actionType:  $enabled ? 'restrict' : 'unrestrict',
                    actionLabel: $label,
                    description: $description,
                    expiresAt:   $expiresAt,
                    adminNote:   $adminNote,
                );
            } else {
                foreach ([$conversation->userA, $conversation->userB] as $participant) {
                    $this->notifyUser(
                        user:        $participant,
                        actionType:  $enabled ? 'restrict' : 'unrestrict',
                        actionLabel: $label,
                        description: $description,
                        expiresAt:   $expiresAt,
                        adminNote:   $adminNote,
                    );
                }
            }
        }

        AdminActionLog::record(
            admin:       $admin,
            action:      'conversation_settings_updated',
            target:      $conversation,
            description: "Updated conversation #{$conversationId} settings",
            metadata:    $data,
            severity:    'info',
        );

        return response()->json(['success' => true, 'conversation' => $conversation->fresh()]);
    }

    // ── Admin actions on a conversation ───────────────────────────────────────

    public function action(Request $request, int $conversationId): JsonResponse
    {
        $conversation = Conversation::with(['userA', 'userB'])->findOrFail($conversationId);
        $admin        = $request->user();
        $act          = $request->input('action');
        $notifyUser   = $request->boolean('notify_user', false);
        $adminNote    = $request->input('admin_note');
        $expiresAt    = $request->input('expires_at');

        $logData = ['action' => $act, 'admin_id' => $admin->id, 'actor_label' => $admin->username ?? 'Teezer Admin'];

        // Determine target user (pick the non-admin participant; default userA)
        $targetUser = $conversation->userA;

        switch ($act) {
            case 'flag':
                $conversation->update(['flagged_at' => now(), 'report_status' => 'open', 'risk_level' => $request->input('risk_level', 'medium')]);
                $this->logActivity($conversationId, $admin->id, 'flagged', $logData);
                // Notify both participants that the conversation was flagged
                foreach ([$conversation->userA, $conversation->userB] as $participant) {
                    $this->notifyUser($participant, 'flag', 'Conversation Flagged',
                        'A conversation on your account has been flagged for review by the Teezer moderation team.',
                        $expiresAt, $adminNote);
                }
                break;

            case 'mark_reviewed':
                $conversation->update(['report_status' => 'reviewed']);
                $this->logActivity($conversationId, $admin->id, 'conversation_reviewed', $logData);
                break;

            case 'close':
                $conversation->update(['report_status' => 'closed', 'admin_closed_at' => now()]);
                $this->logActivity($conversationId, $admin->id, 'conversation_closed', $logData);
                foreach ([$conversation->userA, $conversation->userB] as $participant) {
                    $this->notifyUser($participant, 'close', 'Conversation Closed',
                        'A conversation on your account has been closed by the Teezer moderation team.',
                        $expiresAt, $adminNote);
                }
                break;

            case 'mute':
                $conversation->update(['admin_muted_at' => now()]);
                $this->logActivity($conversationId, $admin->id, 'conversation_muted', $logData);
                foreach ([$conversation->userA, $conversation->userB] as $participant) {
                    $this->notifyUser($participant, 'mute', 'Conversation Muted',
                        'A conversation on your account has been muted by the Teezer moderation team.',
                        $expiresAt, $adminNote);
                }
                break;

            case 'unmute':
                $conversation->update(['admin_muted_at' => null]);
                $this->logActivity($conversationId, $admin->id, 'conversation_unmuted', $logData);
                foreach ([$conversation->userA, $conversation->userB] as $participant) {
                    $this->notifyUser($participant, 'unmute', 'Conversation Unmuted',
                        'A mute has been lifted from a conversation on your account.',
                        null, $adminNote);
                }
                break;

            case 'restrict_dms':
                $conversation->update(['dm_restricted' => true]);
                $this->logActivity($conversationId, $admin->id, 'dm_restricted', $logData);
                foreach ([$conversation->userA, $conversation->userB] as $participant) {
                    $this->notifyUser($participant, 'restrict', 'DM Restricted',
                        'Your ability to send direct messages has been restricted by the Teezer moderation team.',
                        $expiresAt, $adminNote);
                }
                break;

            case 'shadow_restrict':
                $conversation->update(['shadow_restricted' => true]);
                $this->logActivity($conversationId, $admin->id, 'shadow_restricted', $logData);
                foreach ([$conversation->userA, $conversation->userB] as $participant) {
                    $this->notifyUser($participant, 'shadow', 'Visibility Adjusted',
                        'Your account visibility has been adjusted by the Teezer moderation team.',
                        $expiresAt, $adminNote);
                }
                break;

            case 'warn_user':
                $reason = $request->input('reason', '');
                $warnTarget = $conversation->userA->id !== $admin->id ? $conversation->userA : $conversation->userB;
                AdminActionLog::record(admin: $admin, action: 'user_warned_via_messages',
                    target: $warnTarget, description: "Warned user #{$warnTarget->id} from conversation #{$conversationId}: {$reason}");
                $this->logActivity($conversationId, $admin->id, 'user_warned', array_merge($logData, ['reason' => $reason]));
                $this->notifyUser($warnTarget, 'warn', 'Account Warning',
                    "You have received a formal warning from the Teezer moderation team. Reason: {$reason}",
                    $expiresAt, $adminNote);
                break;

            case 'block_user':
                $reason = $request->input('reason', '');
                $blockTarget = $conversation->userA->id !== $admin->id ? $conversation->userA : $conversation->userB;
                User::where('id', $blockTarget->id)->update(['is_banned' => true, 'banned_at' => now()]);
                AdminActionLog::record(admin: $admin, action: 'user_banned',
                    description: "Banned user #{$blockTarget->id} from messages panel. Reason: {$reason}");
                $this->logActivity($conversationId, $admin->id, 'user_blocked', array_merge($logData, ['reason' => $reason]));
                $this->notifyUser($blockTarget, 'block', 'DM Access Blocked',
                    "Your access to direct messages on Teezer has been restricted. Reason: {$reason}",
                    $expiresAt, $adminNote);
                break;

            case 'quick_action':
                $category = $request->input('category');
                $conversation->update(['flagged_at' => now(), 'report_status' => 'open', 'risk_level' => 'high']);
                $this->logActivity($conversationId, $admin->id, "quick_action:{$category}", array_merge($logData, ['category' => $category]));
                break;
        }

        AdminActionLog::record(admin: $admin, action: "conversation_{$act}", target: $conversation,
            description: "Admin action '{$act}' on conversation #{$conversationId}");

        return response()->json(['success' => true]);
    }

    // ── Send in-app notification + email to user ──────────────────────────────

    private function notifyUser(
        User    $user,
        string  $actionType,
        string  $actionLabel,
        string  $description,
        ?string $expiresAt  = null,
        ?string $adminNote  = null,
    ): void {
        // 1. In-app notification
        try {
            $notifService = app(NotificationService::class);
            $notifService->notify($user, 'system', [
                'message' => $description,
            ]);
        } catch (\Throwable) {}

        // 2. Email notification
        if (! app(\App\Services\GlobalControls\GlobalControlService::class)->isEnabled('email_notifications_enabled')) {
            return;
        }
        try {
            $name = $user->name ? explode(' ', $user->name)[0] : $user->username;
            Mail::to($user->email)->queue(new AdminActionMail(
                firstName:   $name,
                username:    $user->username,
                actionType:  $actionType,
                actionLabel: $actionLabel,
                description: $description,
                expiresAt:   $expiresAt ? date('F j, Y \a\t g:i A', strtotime($expiresAt)) : null,
                adminNote:   $adminNote,
            ));
        } catch (\Throwable) {}
    }

    // ── Flag a single message ─────────────────────────────────────────────────

    public function flagMessage(Request $request, int $messageId): JsonResponse
    {
        $message = DirectMessage::findOrFail($messageId);

        // forceFill, not update(): flagged_by_admin is deliberately absent from
        // DirectMessage::$fillable so a user cannot set it on their own message when
        // sending one. It was previously assigned via update(), which meant Eloquent
        // silently discarded both keys and the flag never persisted.
        $message->forceFill([
            'flagged_by_admin' => true,
            'admin_flagged_at' => now(),
        ])->save();

        $this->logActivity($message->conversation_id, $request->user()->id, 'message_flagged', ['message_id' => $messageId]);

        AdminActionLog::record(admin: $request->user(), action: 'message_flagged', target: $message, description: "Flagged message #{$messageId}");

        return response()->json(['success' => true]);
    }

    // ── Delete a single message (admin force-delete for everyone) ────────────

    public function deleteMessage(Request $request, int $messageId): JsonResponse
    {
        $message = DirectMessage::findOrFail($messageId);
        $message->update(['deleted_for_everyone_at' => now(), 'deleted_by_user_id' => $request->user()->id]);

        $this->logActivity($message->conversation_id, $request->user()->id, 'message_deleted', ['message_id' => $messageId]);

        AdminActionLog::record(admin: $request->user(), action: 'message_deleted', target: $message, description: "Admin deleted message #{$messageId}", severity: 'warning');

        return response()->json(['success' => true]);
    }

    // ── Export chat as JSON ───────────────────────────────────────────────────

    public function exportChat(int $conversationId): JsonResponse
    {
        $conversation = Conversation::with(['userA:id,username', 'userB:id,username'])->findOrFail($conversationId);

        $messages = DirectMessage::with('sender:id,username')
            ->where('conversation_id', $conversationId)
            ->orderBy('created_at')
            ->get()
            ->map(fn (DirectMessage $m) => [
                'id'           => $m->id,
                'from'         => $m->sender?->username,
                'body'         => $m->deleted_for_everyone_at ? '[deleted]' : $m->body,
                'type'         => $m->message_type,
                'sent_at'      => $m->created_at?->toISOString(),
                'read_at'      => $m->read_at?->toISOString(),
                'flagged'      => (bool) $m->flagged_by_admin,
            ]);

        return response()->json([
            'conversation_id' => $conversationId,
            'participants'    => [
                $conversation->userA?->username,
                $conversation->userB?->username,
            ],
            'exported_at'     => now()->toISOString(),
            'messages'        => $messages,
        ]);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function resolveUrl(?string $path): ?string
    {
        if (!$path) return null;
        if (str_starts_with($path, 'http')) return $path;
        try {
            return Storage::disk(config('filesystems.default', 'local'))->url($path);
        } catch (\Throwable) {
            return null;
        }
    }

    private function formatUser(?User $user): ?array
    {
        if (!$user) return null;
        $lastActive = $user->last_active_at ? now()->diffInMinutes($user->last_active_at, true) : null;
        return [
            'id'          => $user->id,
            'username'    => $user->username,
            'name'        => $user->name,
            'avatar'      => $this->resolveUrl($user->avatar),
            'is_online'   => $lastActive !== null && $lastActive <= 5,
            'last_active' => $user->last_active_at?->toISOString(),
            'is_banned'   => (bool) $user->is_banned,
        ];
    }

    private function formatMessage(DirectMessage $m): array
    {
        return [
            'id'                    => $m->id,
            'conversation_id'       => $m->conversation_id,
            'sender_id'             => $m->sender_id,
            'receiver_id'           => $m->receiver_id,
            'body'                  => $m->body,
            'message_type'          => $m->message_type ?? 'text',
            'r2_url'                => $this->resolveUrl($m->r2_url),
            'thumbnail_url'         => $this->resolveUrl($m->thumbnail_url),
            'read_at'               => $m->read_at?->toISOString(),
            'edited_at'             => $m->edited_at?->toISOString(),
            'is_pinned'             => (bool) $m->is_pinned,
            'flagged_by_admin'      => (bool) $m->flagged_by_admin,
            'deleted_for_everyone'  => $m->deleted_for_everyone_at !== null,
            'created_at'            => $m->created_at?->toISOString(),
            'sender' => $m->sender ? [
                'id'       => $m->sender->id,
                'username' => $m->sender->username,
                'avatar'   => $this->resolveUrl($m->sender->avatar),
            ] : null,
        ];
    }

    private function logActivity(int $conversationId, int $adminId, string $action, array $meta = []): void
    {
        DB::table('conversation_admin_logs')->insert([
            'conversation_id' => $conversationId,
            'admin_id'        => $adminId,
            'action'          => $action,
            'actor_label'     => 'Teezer Admin',
            'metadata'        => json_encode($meta),
            'created_at'      => now(),
        ]);
    }
}
