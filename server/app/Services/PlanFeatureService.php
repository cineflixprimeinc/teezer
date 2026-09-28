<?php

namespace App\Services;

use App\Models\SubscriptionPlan;
use Illuminate\Support\Facades\DB;

/**
 * The one place that answers "what does this plan include, and up to what
 * limit" - and therefore what a subscriber is entitled to.
 *
 * Same reasoning as PlanAvailabilityService: the website, the app and anything
 * built later all read this through the same endpoint, so none of them decides
 * entitlements itself. A client that parses the plan card's bullet strings to
 * work out whether 4K is allowed is a client that will eventually disagree with
 * the server about what someone paid for.
 *
 * ── The two shapes, and why both exist ──────────────────────────────────────
 *
 *   forPlan()      - the editor's view: every catalogued feature, with whether
 *                    this plan enables it. Includes the OFF ones, because the
 *                    admin needs to see what is available to turn on.
 *   entitlements() - the client's view: only what is ON, keyed by feature, with
 *                    the resolved value. Nothing a client should not act on.
 *
 * ── Groups ─────────────────────────────────────────────────────────────────
 *
 * Group membership is a property of the FEATURE, not of the plan, so it lives
 * in the catalog. Two plans cannot file "Cloud Storage" under different
 * headings and there is nothing to keep in sync.
 */
class PlanFeatureService
{
    /** Display headings, in render order. Keyed by catalog.group_key. */
    public const GROUPS = [
        'content' => 'Content & Experience',
        'creator' => 'Creator & Tools',
        'storage' => 'Storage & Quality',
        'account' => 'Account & Identity',
    ];

    public const VALUE_TYPES = ['boolean', 'select'];

    /**
     * The whole catalog, with this plan's setting merged in.
     *
     * Returns EVERY enabled catalogue row, not just the ones the plan has a row
     * for - a feature added to the catalog after a plan was configured must
     * appear (off) in that plan's editor rather than being invisible until
     * someone re-saves.
     *
     * @return array<int,array<string,mixed>>
     */
    public function forPlan(SubscriptionPlan $plan): array
    {
        $catalog = DB::table('plan_feature_catalog')
            ->where('is_enabled', true)
            ->orderBy('sort')->orderBy('id')
            ->get();

        $configured = DB::table('plan_features')
            ->where('subscription_plan_id', $plan->id)
            ->get()
            ->keyBy('feature_key');

        $out = [];
        foreach ($catalog as $c) {
            $row = $configured->get($c->key);
            $options = $c->options ? json_decode($c->options, true) : null;

            $out[] = [
                'key'         => $c->key,
                'name'        => $c->name,
                'description' => $c->description,
                'icon'        => $c->icon,
                'group_key'   => $c->group_key,
                'group_name'  => self::GROUPS[$c->group_key] ?? null,
                'value_type'  => $c->value_type,
                'options'     => is_array($options) ? $options : [],
                // Absent means OFF. A plan that has never been configured
                // includes nothing rather than everything - the safer default
                // when the answer decides what someone gets for money.
                'is_enabled'  => $row ? (bool) $row->is_enabled : false,
                // Falls back to the catalog default so a freshly enabled
                // select-feature has a sensible value instead of null.
                'value'       => $row->value ?? $c->default_value,
                'sort'        => $row->sort ?? $c->sort,
                'in_plan'     => (bool) $row,
            ];
        }

        // Plan order wins over catalog order - that is what the drag handle in
        // the editor writes, and it is per-plan by design.
        usort($out, fn ($a, $b) => $a['sort'] <=> $b['sort']);

        return $out;
    }

    /**
     * What a subscriber on this plan may actually do.
     *
     * Keyed by feature so a client asks `entitlements['upload_quality']`
     * rather than searching a list. Only ON features appear: an absent key
     * means "not included", which is the one interpretation that cannot be
     * misread as "included but unlimited".
     *
     * @return array<string,array{value:?string,name:string}>
     */
    public function entitlements(SubscriptionPlan $plan): array
    {
        $out = [];
        foreach ($this->forPlan($plan) as $f) {
            if (! $f['is_enabled']) {
                continue;
            }
            $out[$f['key']] = ['value' => $f['value'], 'name' => $f['name']];
        }

        return $out;
    }

    /**
     * Persist the editor's feature set for one plan.
     *
     * @param  array<int,array{key:string,is_enabled?:bool,value?:?string,sort?:int}>  $rows
     */
    public function save(SubscriptionPlan $plan, array $rows): void
    {
        $valid = DB::table('plan_feature_catalog')->pluck('key')->flip();
        $now = now();

        DB::transaction(function () use ($plan, $rows, $valid, $now) {
            $seen = [];

            foreach ($rows as $i => $r) {
                $key = (string) ($r['key'] ?? '');
                // Silently skipped rather than rejected: an unknown key means
                // the catalog changed under an open editor, and failing the
                // whole save would lose every other edit on the page.
                if ($key === '' || ! $valid->has($key)) {
                    continue;
                }
                $seen[] = $key;

                DB::table('plan_features')->updateOrInsert(
                    ['subscription_plan_id' => $plan->id, 'feature_key' => $key],
                    [
                        'is_enabled' => (bool) ($r['is_enabled'] ?? false),
                        'value'      => $r['value'] ?? null,
                        'sort'       => (int) ($r['sort'] ?? $i * 10),
                        'updated_at' => $now,
                        'created_at' => $now,
                    ],
                );
            }

            // Rows the editor no longer sent are removed, so "remove from plan"
            // is expressible at all. Scoped to this plan.
            DB::table('plan_features')
                ->where('subscription_plan_id', $plan->id)
                ->when($seen !== [], fn ($q) => $q->whereNotIn('feature_key', $seen))
                ->delete();

            /* syncDisplayStrings is deliberately NOT called here.
               `subscription_plans.features` holds hand-written marketing copy -
               live rows say "Everything in Starter", "Priority Space slots",
               "5 team seats with roles". None of that is derivable from a
               feature catalog, and regenerating it on every save would destroy
               curated copy the first time an admin touched this tab.
               So the two stay separate on purpose: `features` is what the card
               PRINTS, plan_features is what the app ENFORCES. The sync method
               is kept for an explicit, opt-in "regenerate from features" action
               where the admin can see what they are replacing. */
        });
    }

    /**
     * Regenerate `subscription_plans.features` from the structured set.
     *
     * NOT called by save() - see the note there. This is destructive: it
     * replaces hand-written marketing copy with generated labels, so it must
     * only ever run from an explicit admin action where they can see what is
     * being overwritten.
     */
    public function syncDisplayStrings(SubscriptionPlan $plan): void
    {
        $labels = [];
        foreach ($this->forPlan($plan) as $f) {
            if (! $f['is_enabled']) {
                continue;
            }
            // "Cloud Storage: 100 GB" for measured features, bare name for
            // on/off ones - a boolean rendered as "Remove Ads: 1" reads as a bug.
            $labels[] = $f['value_type'] === 'select' && $f['value']
                ? "{$f['name']}: {$f['value']}"
                : $f['name'];
        }

        $plan->forceFill(['features' => $labels])->saveQuietly();
    }

    /** The library, for the admin's "add a feature" panel. */
    public function catalog(): array
    {
        return DB::table('plan_feature_catalog')
            ->where('is_enabled', true)
            ->orderBy('sort')->orderBy('id')
            ->get()
            ->map(fn ($c) => [
                'key'         => $c->key,
                'name'        => $c->name,
                'description' => $c->description,
                'icon'        => $c->icon,
                'group_key'   => $c->group_key,
                'group_name'  => self::GROUPS[$c->group_key] ?? null,
                'value_type'  => $c->value_type,
                'options'     => $c->options ? json_decode($c->options, true) : [],
                'default_value' => $c->default_value,
            ])
            ->all();
    }

    /** Feature counts per group, for the sidebar. Counted, never assumed. */
    public function groupCounts(SubscriptionPlan $plan): array
    {
        $counts = [];
        foreach (array_keys(self::GROUPS) as $g) {
            $counts[$g] = 0;
        }
        foreach ($this->forPlan($plan) as $f) {
            if ($f['is_enabled'] && isset($counts[$f['group_key']])) {
                $counts[$f['group_key']]++;
            }
        }

        return $counts;
    }
}
