<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\NotificationResource;
use App\Services\NotificationPresenter;
use App\Models\AppNotification;
use App\Models\NotificationActor;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $notifs = AppNotification::with('actor')
            ->where('user_id', $request->user()->id)
            ->orderByDesc('latest_activity_at')
            ->orderByDesc('id')
            ->paginate($request->input('per_page', 20));

        // Comment->video resolution, thumbnails and the latest actors per group,
        // three batched queries for the whole page. Lives in NotificationPresenter
        // because the realtime publish path needs the identical shape for the one
        // row it announces - see NotificationService::pushRealtime.
        NotificationPresenter::enrich($notifs->getCollection()->all());

        return response()->json([
            'success' => true,
            'data'    => NotificationResource::collection($notifs),
            'meta'    => [
                'current_page' => $notifs->currentPage(),
                'last_page'    => $notifs->lastPage(),
                'per_page'     => $notifs->perPage(),
                'total'        => $notifs->total(),
                'next_page_url'=> $notifs->nextPageUrl(),
            ],
        ]);
    }

    /**
     * GET /notifications/{id}/actors - the full, paginated list of users who
     * triggered an aggregated group ("everyone who liked your video"). Scoped to
     * the owner so ids can't be probed. Newest actor first.
     */
    public function actors(Request $request, int $id): JsonResponse
    {
        $notif = AppNotification::where('id', $id)
            ->where('user_id', $request->user()->id)
            ->firstOrFail();

        $actors = NotificationActor::query()
            ->where('notification_actors.notification_id', $notif->id)
            ->join('users', 'users.id', '=', 'notification_actors.actor_id')
            ->orderByDesc('notification_actors.id')
            ->select('users.id', 'users.username', 'users.name', 'users.avatar', 'users.is_verified')
            ->paginate($request->input('per_page', 30));

        $data = $actors->getCollection()->map(fn ($u) => [
            'id'          => (int) $u->id,
            'username'    => $u->username,
            'name'        => $u->name,
            'avatar'      => $u->avatar ? Storage::url($u->avatar) : StorageService::defaultAvatarUrl(),
            'is_verified' => (bool) $u->is_verified,
        ]);

        return response()->json([
            'success' => true,
            'data'    => $data,
            'meta'    => [
                'current_page' => $actors->currentPage(),
                'last_page'    => $actors->lastPage(),
                'per_page'     => $actors->perPage(),
                'total'        => $actors->total(),
                'next_page_url'=> $actors->nextPageUrl(),
            ],
        ]);
    }

    public function unreadCount(Request $request): JsonResponse
    {
        // One unread group == one card, so counting unread rows counts unread
        // notifications the user sees (aggregation already collapsed duplicates).
        //
        // `exclude` is a comma-separated type list for surfaces that never show
        // those rows as unread - the mobile app hides profile_view everywhere,
        // so its badge must not count them or the number never clears.
        $query = AppNotification::where('user_id', $request->user()->id)
            ->where('is_read', false);

        $exclude = array_filter(array_map('trim', explode(',', (string) $request->query('exclude'))));
        if ($exclude !== []) {
            $query->whereNotIn('type', $exclude);
        }

        return response()->json(['success' => true, 'data' => ['count' => $query->count()]]);
    }

    public function markRead(Request $request, int $id): JsonResponse
    {
        AppNotification::where('id', $id)->where('user_id', $request->user()->id)
            ->update(['is_read' => true, 'updated_at' => now()]);

        return response()->json(['success' => true]);
    }

    /**
     * Bulk mark-as-read for a specific set of notification ids - used when a
     * user opens an Inbox category so everything they just saw is marked read in
     * one request. Scoped to the authenticated user's own notifications.
     */
    public function markManyRead(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ids'   => ['required', 'array', 'max:200'],
            'ids.*' => ['integer'],
        ]);

        $updated = AppNotification::whereIn('id', $validated['ids'])
            ->where('user_id', $request->user()->id)
            ->update(['is_read' => true, 'updated_at' => now()]);

        return response()->json(['success' => true, 'data' => ['updated' => $updated]]);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        // Optional scoping so one inbox menu can clear ITS OWN badge without
        // wiping the other menus' unread state: the mobile app passes `types`
        // (System, Gifts) or `exclude_types` (Activity) for the menu opened.
        // An empty body keeps the historical "mark everything" behaviour.
        $validated = $request->validate([
            'types'         => ['sometimes', 'array', 'max:50'],
            'types.*'       => ['string'],
            'exclude_types' => ['sometimes', 'array', 'max:50'],
            'exclude_types.*' => ['string'],
        ]);

        $query = AppNotification::where('user_id', $request->user()->id)
            ->where('is_read', false);

        if (! empty($validated['types'])) {
            $query->whereIn('type', $validated['types']);
        }
        if (! empty($validated['exclude_types'])) {
            $query->whereNotIn('type', $validated['exclude_types']);
        }

        $query->update(['is_read' => true, 'updated_at' => now()]);

        return response()->json(['success' => true, 'message' => 'All notifications marked as read.']);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        // Cascade on notification_actors removes the actor history too.
        AppNotification::where('id', $id)->where('user_id', $request->user()->id)->delete();

        return response()->json(['success' => true]);
    }
}
