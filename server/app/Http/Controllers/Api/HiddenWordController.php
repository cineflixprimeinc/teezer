<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\UserHiddenWord;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * User-managed word blocklists behind Content Preferences → Keyword Filters,
 * Hashtag Filters, and Not Interested Keywords. Adding a word here blocks other
 * users from using it in comments on this user's videos and in DMs to them.
 */
class HiddenWordController extends Controller
{
    /** GET /profile/hidden-words → { keyword:[], hashtag:[], not_interested:[] } */
    public function index(Request $request): JsonResponse
    {
        $grouped = UserHiddenWord::where('user_id', $request->user()->id)
            ->orderBy('created_at', 'desc')
            ->get(['id', 'type', 'word'])
            ->groupBy('type');

        $data = [];
        foreach (UserHiddenWord::TYPES as $type) {
            $data[$type] = ($grouped[$type] ?? collect())
                ->map(fn ($w) => ['id' => $w->id, 'word' => $w->word])
                ->values();
        }

        return response()->json(['success' => true, 'data' => $data]);
    }

    /** POST /profile/hidden-words { type, word } → adds one word (idempotent). */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type' => ['required', Rule::in(UserHiddenWord::TYPES)],
            'word' => ['required', 'string', 'max:100'],
        ]);

        $word = UserHiddenWord::normalize($validated['word']);
        if ($word === '') {
            return response()->json(['success' => false, 'message' => 'Please enter a valid word.'], 422);
        }

        $row = UserHiddenWord::firstOrCreate([
            'user_id' => $request->user()->id,
            'type'    => $validated['type'],
            'word'    => $word,
        ]);

        return response()->json([
            'success' => true,
            'data'    => ['id' => $row->id, 'type' => $row->type, 'word' => $row->word],
        ], $row->wasRecentlyCreated ? 201 : 200);
    }

    /** DELETE /profile/hidden-words/{id} → removes one of the caller's words. */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $deleted = UserHiddenWord::where('id', $id)
            ->where('user_id', $request->user()->id)
            ->delete();

        if (!$deleted) {
            return response()->json(['success' => false, 'message' => 'Word not found.'], 404);
        }

        return response()->json(['success' => true]);
    }
}
