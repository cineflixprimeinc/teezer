<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminActionLog;
use App\Models\Challenge;
use App\Models\ChallengeParticipant;
use App\Models\Hashtag;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Hashtag Challenges for the admin panel - unlike Spaces (hosted by users,
 * read-mostly here), a challenge IS authored by staff: title, prize, dates and
 * cover colors are all admin input, so this is full CRUD, closer in shape to
 * AdminMusicController than to AdminSpaceController. The one lever borrowed
 * from Spaces is `end` - force-closing a challenge early, same idea as
 * force-ending a live room.
 */
class AdminChallengeController extends Controller
{
    private const HEX_RULE = 'regex:/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/';

    /** GET /admin/challenges - paginated, searchable by title. */
    public function index(Request $request): JsonResponse
    {
        $q = Challenge::query()->with(['hashtag:id,name', 'creator:id,name,username']);

        if ($request->filled('search')) {
            $t = trim((string) $request->input('search'));
            $q->where(fn ($sq) => $sq->where('title', 'ilike', "%{$t}%")
                ->orWhere('prize_description', 'ilike', "%{$t}%"));
        }

        if ($request->filled('status') && in_array($request->input('status'), [Challenge::STATUS_ACTIVE, Challenge::STATUS_ENDED], true)) {
            $status = $request->input('status');
            $q->where(fn ($sq) => $status === Challenge::STATUS_ACTIVE
                ? $sq->where('ends_at', '>=', now())
                : $sq->where('ends_at', '<', now()));
        }

        match ($request->input('sort')) {
            'oldest'   => $q->orderBy('id'),
            'entries'  => $q->orderByDesc('ends_at'), // real entries aren't a column; ends_at is the closest cheap proxy for "most active"
            default    => $q->orderBy('ends_at'), // soonest-ending first, same as the public list
        };

        $perPage    = min((int) $request->input('per_page', 20), 50);
        $challenges = $q->paginate($perPage);

        return response()->json([
            'success' => true,
            'data'    => $challenges->getCollection()->map(fn (Challenge $c) => $this->resource($c))->all(),
            'meta'    => [
                'current_page' => $challenges->currentPage(),
                'last_page'    => $challenges->lastPage(),
                'per_page'     => $challenges->perPage(),
                'total'        => $challenges->total(),
            ],
            'stats' => $this->statsArray(),
        ]);
    }

    /** GET /admin/challenges/stats - the counters above the table, pollable on their own. */
    public function stats(): JsonResponse
    {
        return response()->json(['success' => true, 'data' => $this->statsArray()]);
    }

    /** GET /admin/challenges/{challenge} */
    public function show(Challenge $challenge): JsonResponse
    {
        $challenge->load(['hashtag:id,name', 'creator:id,name,username']);

        return response()->json(['success' => true, 'data' => $this->resource($challenge)]);
    }

    /** POST /admin/challenges - create a new challenge. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title'              => ['required', 'string', 'max:120'],
            // Either point at an existing hashtag, or hand over the raw tag
            // text and let the admin panel find-or-create it - a challenge can
            // launch for a tag that has never been used before.
            'hashtag_id'         => ['nullable', 'integer', 'exists:hashtags,id'],
            'hashtag'            => ['nullable', 'string', 'max:100'],
            'prize_description'  => ['nullable', 'string', 'max:255'],
            'cover_start_color'  => ['nullable', 'string', self::HEX_RULE],
            'cover_end_color'    => ['nullable', 'string', self::HEX_RULE],
            'starts_at'          => ['nullable', 'date'],
            'ends_at'            => ['required', 'date'],
        ]);

        $startsAt = $data['starts_at'] ?? now();
        if (\Illuminate\Support\Carbon::parse($data['ends_at'])->lessThanOrEqualTo($startsAt)) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors'  => ['ends_at' => ['The end date must be after the start date.']],
            ], 422);
        }

        $hashtagId = $data['hashtag_id'] ?? null;
        if (! $hashtagId && $request->filled('hashtag')) {
            $hashtagId = $this->resolveHashtag($request->string('hashtag')->value())->id;
        }

        $challenge = Challenge::create([
            'title'              => $data['title'],
            'hashtag_id'         => $hashtagId,
            'prize_description'  => $data['prize_description'] ?? null,
            'cover_start_color'  => $data['cover_start_color'] ?? null,
            'cover_end_color'    => $data['cover_end_color'] ?? null,
            'starts_at'          => $data['starts_at'] ?? now(),
            'ends_at'            => $data['ends_at'],
            'status'             => Challenge::STATUS_ACTIVE,
            'created_by'         => $request->user()->id,
        ]);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'create_challenge',
            target: $challenge,
            description: 'Admin created challenge: ' . $challenge->title,
            severity: 'info',
        );

        return response()->json(['success' => true, 'data' => $this->resource($challenge->fresh(['hashtag', 'creator']))], 201);
    }

    /** PATCH /admin/challenges/{challenge} - edit any field. */
    public function update(Request $request, Challenge $challenge): JsonResponse
    {
        $data = $request->validate([
            'title'              => ['sometimes', 'required', 'string', 'max:120'],
            'hashtag_id'         => ['sometimes', 'nullable', 'integer', 'exists:hashtags,id'],
            'hashtag'            => ['sometimes', 'nullable', 'string', 'max:100'],
            'prize_description'  => ['sometimes', 'nullable', 'string', 'max:255'],
            'cover_start_color'  => ['sometimes', 'nullable', 'string', self::HEX_RULE],
            'cover_end_color'    => ['sometimes', 'nullable', 'string', self::HEX_RULE],
            'starts_at'          => ['sometimes', 'nullable', 'date'],
            'ends_at'            => ['sometimes', 'date'],
            'status'             => ['sometimes', Rule::in([Challenge::STATUS_ACTIVE, Challenge::STATUS_ENDED])],
        ]);

        $updates = $request->only([
            'title', 'prize_description', 'cover_start_color', 'cover_end_color', 'starts_at', 'ends_at', 'status',
        ]);

        $newStarts = array_key_exists('starts_at', $updates) ? $updates['starts_at'] : $challenge->starts_at;
        $newEnds   = array_key_exists('ends_at', $updates) ? $updates['ends_at'] : $challenge->ends_at;
        if ($newStarts && \Illuminate\Support\Carbon::parse($newEnds)->lessThanOrEqualTo($newStarts)) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors'  => ['ends_at' => ['The end date must be after the start date.']],
            ], 422);
        }

        if ($request->has('hashtag_id')) {
            $updates['hashtag_id'] = $data['hashtag_id'] ?? null;
        } elseif ($request->filled('hashtag')) {
            $updates['hashtag_id'] = $this->resolveHashtag($request->string('hashtag')->value())->id;
        }

        $challenge->update($updates);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'update_challenge',
            target: $challenge,
            description: 'Admin updated challenge: ' . $challenge->title,
            metadata: $updates,
            severity: 'info',
        );

        return response()->json(['success' => true, 'data' => $this->resource($challenge->fresh(['hashtag', 'creator']))]);
    }

    /** POST /admin/challenges/{challenge}/end - force-set ends_at to now (same lever as ending a live Space). */
    public function end(Request $request, Challenge $challenge): JsonResponse
    {
        if (! $challenge->isActive()) {
            return response()->json(['success' => false, 'message' => 'This challenge has already ended.'], 422);
        }

        $challenge->update(['ends_at' => now(), 'status' => Challenge::STATUS_ENDED]);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'end_challenge',
            target: $challenge,
            description: 'Admin force-ended challenge: ' . $challenge->title,
            severity: 'warning',
        );

        return response()->json(['success' => true, 'message' => 'Challenge ended.', 'data' => $this->resource($challenge->fresh(['hashtag', 'creator']))]);
    }

    /** DELETE /admin/challenges/{challenge} */
    public function destroy(Request $request, Challenge $challenge): JsonResponse
    {
        $title = $challenge->title;

        AdminActionLog::record(
            admin: $request->user(),
            action: 'delete_challenge',
            target: $challenge,
            description: 'Admin deleted challenge: ' . $title,
            severity: 'warning',
        );

        $challenge->delete(); // challenge_participants cascade

        return response()->json(['success' => true, 'message' => 'Challenge deleted.']);
    }

    /** Find-or-create a Hashtag by its bare tag text (no leading #). */
    private function resolveHashtag(string $raw): Hashtag
    {
        $name = strtolower(ltrim(trim($raw), '#'));

        return Hashtag::firstOrCreate(['name' => $name], ['videos_count' => 0]);
    }

    /** The counters above the table. */
    private function statsArray(): array
    {
        return [
            'total'               => Challenge::count(),
            'active'              => Challenge::query()->active()->count(),
            'ended'               => Challenge::where('ends_at', '<', now())->count(),
            'total_participants'  => ChallengeParticipant::count(),
        ];
    }

    /** The row shape the admin table (and edit form) renders. */
    private function resource(Challenge $c): array
    {
        return [
            'id'                 => $c->id,
            'title'              => $c->title,
            'hashtag_id'         => $c->hashtag_id,
            'hashtag'            => $c->hashtag?->name,
            'prize_description'  => $c->prize_description,
            'cover_start_color'  => $c->cover_start_color,
            'cover_end_color'    => $c->cover_end_color,
            'starts_at'          => $c->starts_at?->toIso8601String(),
            'ends_at'            => $c->ends_at?->toIso8601String(),
            'status'             => $c->isActive() ? Challenge::STATUS_ACTIVE : Challenge::STATUS_ENDED,
            'participants_count' => $c->participants()->count(),
            'entries_count'      => $c->entriesCount(),
            'created_by'         => $c->creator ? [
                'id'       => $c->creator->id,
                'name'     => $c->creator->name,
                'username' => $c->creator->username,
            ] : null,
            'created_at' => $c->created_at?->toIso8601String(),
        ];
    }
}
