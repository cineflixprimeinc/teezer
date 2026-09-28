<?php

namespace App\Services;

use App\Models\AppNotification;
use Illuminate\Support\Facades\DB;

/**
 * The number on the app icon.
 *
 * This has to be the SAME number the Inbox tab draws, or the badge and the tab
 * disagree the moment a push lands: the app's own badge is
 * notifications + unread DMs + pending message requests
 * (mobile/src/components/nav/TeezerTabBar.tsx, `computedBadge`), not just
 * notifications - so a push carrying only the notification count would make the
 * icon read lower than the tab it opens.
 *
 * The three counts are deliberately the same queries the two endpoints the app
 * polls already run - NotificationController::unreadCount and
 * MessageController::unreadCount - because the badge must not be able to drift
 * from what the app computes for itself. Those controllers still run their own
 * copies; they are the read path for the polling client and are left alone
 * here. If they are ever changed, this must change with them.
 *
 * Failure is soft everywhere it is used: a badge that cannot be computed is
 * simply omitted from the payload, which leaves the previous badge in place
 * rather than dropping the push.
 */
class UnreadBadgeService
{
    /**
     * Types that never render as an unread row in the app, so the badge must
     * not count them or the number can never reach zero. Mirrors the
     * `exclude` the app sends to /notifications/unread-count.
     */
    private const EXCLUDED_TYPES = ['profile_view'];

    public function for(int $userId): int
    {
        return $this->notifications($userId)
            + $this->messages($userId)
            + $this->messageRequests($userId);
    }

    /** Unread notification GROUPS - aggregation already collapsed duplicates. */
    private function notifications(int $userId): int
    {
        return AppNotification::where('user_id', $userId)
            ->where('is_read', false)
            ->whereNotIn('type', self::EXCLUDED_TYPES)
            ->count();
    }

    /**
     * Unread DMs in approved conversations only. A message sitting in an
     * un-accepted request is counted by messageRequests() below instead, so
     * counting it here too would double it.
     */
    private function messages(int $userId): int
    {
        $rows = DB::select("
            SELECT COUNT(*) AS cnt
            FROM direct_messages dm
            LEFT JOIN conversations c ON c.user_a_id = LEAST(dm.sender_id, dm.receiver_id)
                AND c.user_b_id = GREATEST(dm.sender_id, dm.receiver_id)
            WHERE dm.receiver_id = ?
              AND dm.read_at IS NULL
              AND (c.id IS NULL OR c.status = 'approved')
        ", [$userId]);

        return (int) ($rows[0]->cnt ?? 0);
    }

    private function messageRequests(int $userId): int
    {
        return DB::table('conversations')
            ->where('status', 'pending_request')
            ->where(function ($q) use ($userId) {
                $q->where('received_by', $userId)
                  ->orWhere('initiated_by', $userId);
            })
            ->count();
    }
}
