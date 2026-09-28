<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminActionLog;
use App\Models\MusicTaxonomyTerm;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * The music vocabulary - genres, moods, languages.
 *
 * Each list is returned with the number of tracks actually using it, because
 * the two can disagree and the disagreement is the useful part: a term nothing
 * uses is a candidate for removal, and a value tracks use that is NOT in the
 * vocabulary came from the old hardcoded arrays or a hand-edited row, and would
 * otherwise be invisible.
 *
 * Counting is done by name against the tracks' own comma-joined text rather
 * than through a relation - see the migration for why there isn't one.
 */
class AdminMusicTaxonomyController extends Controller
{
    /** GET /admin/music/taxonomy/{kind} */
    public function index(string $kind): JsonResponse
    {
        abort_unless(in_array($kind, MusicTaxonomyTerm::KINDS, true), 404);

        $terms  = MusicTaxonomyTerm::kind($kind)->ordered()->get();
        $counts = $this->usageCounts($kind);

        $known = [];
        $data  = $terms->map(function (MusicTaxonomyTerm $t) use ($counts, &$known) {
            $known[mb_strtolower($t->name)] = true;

            return [
                'id'          => $t->id,
                'name'        => $t->name,
                'sort_order'  => $t->sort_order,
                'is_active'   => $t->is_active,
                'track_count' => $counts[mb_strtolower($t->name)] ?? 0,
            ];
        })->all();

        // Values tracks actually carry that no term covers. Surfaced so they can
        // be adopted into the vocabulary in one click instead of being retyped.
        $orphans = [];
        foreach ($counts as $lower => $n) {
            if (! isset($known[$lower])) {
                $orphans[] = ['name' => $this->originalCase[$lower] ?? $lower, 'track_count' => $n];
            }
        }

        return response()->json([
            'success' => true,
            'data'    => ['terms' => $data, 'orphans' => $orphans],
        ]);
    }

    /** POST /admin/music/taxonomy/{kind} */
    public function store(Request $request, string $kind): JsonResponse
    {
        abort_unless(in_array($kind, MusicTaxonomyTerm::KINDS, true), 404);

        $data = $request->validate([
            'name' => [
                'required', 'string', 'max:80',
                // Scoped to the kind: "Cinematic" is a legitimate genre AND a
                // legitimate mood, and they are separate lists.
                Rule::unique('music_taxonomy_terms', 'name')->where('kind', $kind),
            ],
        ]);

        $term = MusicTaxonomyTerm::create([
            'kind'       => $kind,
            'name'       => trim($data['name']),
            // New terms land at the end rather than jumping the picker's order.
            'sort_order' => (int) MusicTaxonomyTerm::kind($kind)->max('sort_order') + 1,
            'is_active'  => true,
        ]);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'music_taxonomy_create',
            description: "Added {$kind}: {$term->name}",
            target: $term,
            metadata: ['kind' => $kind, 'name' => $term->name],
        );

        return response()->json(['success' => true, 'message' => "Added {$term->name}.", 'data' => $term]);
    }

    /** PUT /admin/music/taxonomy/{kind}/{id} */
    public function update(Request $request, string $kind, int $id): JsonResponse
    {
        abort_unless(in_array($kind, MusicTaxonomyTerm::KINDS, true), 404);

        $term = MusicTaxonomyTerm::kind($kind)->findOrFail($id);

        $data = $request->validate([
            'name'       => ['sometimes', 'string', 'max:80',
                Rule::unique('music_taxonomy_terms', 'name')->where('kind', $kind)->ignore($term->id)],
            'is_active'  => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:9999'],
        ]);

        $was = $term->name;
        $term->update($data);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'music_taxonomy_update',
            description: "Updated {$kind}: {$was}",
            target: $term,
            metadata: ['kind' => $kind, 'from' => $was, 'to' => $term->name],
        );

        return response()->json(['success' => true, 'message' => 'Saved.', 'data' => $term]);
    }

    /** DELETE /admin/music/taxonomy/{kind}/{id} */
    public function destroy(Request $request, string $kind, int $id): JsonResponse
    {
        abort_unless(in_array($kind, MusicTaxonomyTerm::KINDS, true), 404);

        $term = MusicTaxonomyTerm::kind($kind)->findOrFail($id);

        // Refused while tracks still carry it. Deleting would not untag them -
        // they hold text, not a key - so the term would vanish from the picker
        // while still showing on tracks, with no way to manage it. Deactivating
        // is the honest way to retire one.
        $used = $this->usageCounts($kind)[mb_strtolower($term->name)] ?? 0;
        if ($used > 0) {
            return response()->json([
                'success' => false,
                'message' => "{$term->name} is used by {$used} track(s). Turn it off instead of deleting it.",
            ], 422);
        }

        $name = $term->name;
        $term->delete();

        AdminActionLog::record(
            admin: $request->user(),
            action: 'music_taxonomy_delete',
            description: "Removed {$kind}: {$name}",
            metadata: ['kind' => $kind, 'name' => $name],
        );

        return response()->json(['success' => true, 'message' => "Removed {$name}."]);
    }

    /** Lowercased name => track count. */
    private array $originalCase = [];

    private function usageCounts(string $kind): array
    {
        // language lives in its own column; genre and mood share the same
        // comma-joined shape the upload form writes.
        $column = $kind === 'language' ? 'language' : $kind;

        $rows = DB::table('music_tracks')
            ->whereNotNull($column)
            ->where($column, '!=', '')
            ->pluck($column);

        $counts = [];
        foreach ($rows as $raw) {
            foreach (explode(',', (string) $raw) as $piece) {
                $name = trim($piece);
                if ($name === '') {
                    continue;
                }
                $lower = mb_strtolower($name);
                $counts[$lower] = ($counts[$lower] ?? 0) + 1;
                $this->originalCase[$lower] ??= $name;
            }
        }

        arsort($counts);

        return $counts;
    }
}
