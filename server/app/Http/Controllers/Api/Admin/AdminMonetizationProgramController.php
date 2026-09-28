<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminActionLog;
use App\Models\AdminCoinSetting;
use App\Models\MonetizationProgram;
use App\Models\PlatformRequirement;
use App\Services\IsoCountries;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use App\Services\ProgramWaitlistNotifier;

/**
 * Admin → Settings → Monetization Enable and Disable.
 *
 * Owns the five programmes: whether each one is on, what it asks for, and what
 * it says it unlocks. Both clients read the same rows, so a change here moves
 * the app and the website together.
 */
class AdminMonetizationProgramController extends Controller
{
    /** GET /admin/monetization-programs */
    public function index(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => [
                'programs' => MonetizationProgram::allCached()
                    ->map(fn ($p) => $p->toClientArray() + ['id' => $p->id])
                    ->values(),
                // The form builds its metric picker from this, so adding a
                // measurable metric is a one-line change in the model.
                'metrics'  => collect(MonetizationProgram::METRICS)
                    ->map(fn ($m, $k) => ['key' => $k, 'label' => $m['label'], 'counted' => $m['counted']])
                    ->values(),
                'modes'     => MonetizationProgram::MODES,
                'platforms' => MonetizationProgram::PLATFORMS,
                'surfaces'  => MonetizationProgram::SURFACES,
                // The feature-bullet icon picker's options.
                'feature_icons' => MonetizationProgram::FEATURE_ICONS,
                // Platform-wide requirements EVERY programme carries on top of
                // its own. Editable via PUT /admin/platform-requirements/{key}
                // below - a disabled row here stops applying to every
                // programme immediately, so an admin can see, and change,
                // exactly what's enforced beyond what they configured per
                // programme.
                'baseline_requirements' => PlatformRequirement::allCached()
                    ->map(fn ($r) => $r->toClientArray())
                    ->values(),
                // The picker's options. Served from the same ISO table the
                // country-detection module validates against, so an operator
                // cannot pick a code the rest of the platform would reject.
                'countries' => collect(IsoCountries::map())
                    ->map(fn ($name, $code) => ['code' => $code, 'name' => $name])
                    ->values(),
                'enabled'   => MonetizationProgram::masterEnabled(),
                // The console's Recent Changes / Audit feed. Read from the same
                // log every other admin action writes to, so nothing here is a
                // separate record that could disagree with it.
                'changes'   => \App\Models\AdminActionLog::whereIn('action', [
                        'monetization_program_update',
                        'monetization_program_mode',
                        'monetization_master_switch',
                        'platform_requirement_update',
                    ])
                    ->latest('id')->limit(20)
                    ->get(['id', 'action', 'description', 'admin_id', 'created_at'])
                    ->map(fn ($l) => [
                        'id'          => $l->id,
                        'action'      => $l->action,
                        'description' => $l->description,
                        'at'          => $l->created_at?->toIso8601String(),
                    ]),
            ],
        ]);
    }

    /** PUT /admin/monetization-programs/{key} */
    public function update(Request $request, string $key): JsonResponse
    {
        $program = MonetizationProgram::where('key', $key)->firstOrFail();

        $data = $request->validate([
            'label'                  => ['sometimes', 'string', 'max:80'],
            'description'            => ['sometimes', 'nullable', 'string', 'max:400'],
            'mode'                   => ['sometimes', Rule::in(MonetizationProgram::MODES)],
            'requirements'           => ['sometimes', 'array', 'max:12'],
            // Only a metric the server can actually measure. Anything else
            // would be a requirement no creator could ever satisfy.
            'requirements.*.key'     => ['required', Rule::in(array_keys(MonetizationProgram::METRICS))],
            'requirements.*.label'   => ['nullable', 'string', 'max:80'],
            'requirements.*.target'  => ['nullable', 'numeric', 'min:0', 'max:1000000000'],
            'unlocks'                => ['sometimes', 'array', 'max:12'],
            'unlocks.*'              => ['required', 'string', 'max:80'],

            // ── Reach ──────────────────────────────────────────────────
            'visible_app'            => ['sometimes', 'boolean'],
            'visible_web'            => ['sometimes', 'boolean'],
            'countries'              => ['sometimes', 'nullable', 'array', 'max:250'],
            'countries.*'            => ['required', 'string', 'size:2'],
            'rollout_percent'        => ['sometimes', 'integer', 'min:0', 'max:100'],
            'starts_at'              => ['sometimes', 'nullable', 'date'],

            // ── Terms ──────────────────────────────────────────────────
            'commission_rate'        => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            'min_payout'             => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100000'],
            'hold_days'              => ['sometimes', 'integer', 'min:0', 'max:365'],

            // ── Entry ──────────────────────────────────────────────────
            'auto_approve'           => ['sometimes', 'boolean'],
            'waitlist_enabled'       => ['sometimes', 'boolean'],
            'notice'                 => ['sometimes', 'nullable', 'string', 'max:300'],
            // Overrides the client's own default CTA text (Get Started / Apply
            // Now / Notify Me When It Opens / etc.) for this programme. Null
            // clears the override.
            'cta_label'              => ['sometimes', 'nullable', 'string', 'max:40'],

            // ── App intro pitch (Gifts & Coins / Sell on Reelsoo / Creator
            //    Rewards' dedicated screens) ──────────────────────────────
            'hero_title'             => ['sometimes', 'nullable', 'string', 'max:120'],
            'hero_description'       => ['sometimes', 'nullable', 'string', 'max:400'],
            'features'               => ['sometimes', 'nullable', 'array', 'max:5'],
            'features.*.icon'        => ['required', Rule::in(MonetizationProgram::FEATURE_ICONS)],
            'features.*.title'       => ['required', 'string', 'max:60'],
            'features.*.desc'        => ['nullable', 'string', 'max:150'],

            // ── Placement ──────────────────────────────────────────────
            'platforms'              => ['sometimes', 'nullable', 'array'],
            'platforms.*'            => ['required', Rule::in(MonetizationProgram::PLATFORMS)],
            'surfaces'               => ['sometimes', 'nullable', 'array'],
            'surfaces.*'             => ['required', Rule::in(MonetizationProgram::SURFACES)],
            'ends_at'                => ['sometimes', 'nullable', 'date'],
        ]);

        /* visible_app / visible_web are derived from `platforms` so the two can
           never disagree - an older client reading the flags gets the same
           answer as a new one reading the list. */
        if (array_key_exists('platforms', $data)) {
            $p = $data['platforms'] ?? [];
            $data['visible_app'] = empty($p) || (bool) array_intersect($p, ['android', 'ios']);
            $data['visible_web'] = empty($p) || (bool) array_intersect($p, ['web', 'api']);
        }

        // Uppercase once here so `allowsCountry` never has to normalise on the
        // hot path, and a list saved as "np" matches a CF header of "NP".
        if (! empty($data['countries'])) {
            $data['countries'] = array_values(array_unique(array_map('strtoupper', $data['countries'])));
        }

        if (array_key_exists('requirements', $data)) {
            // A counted metric with no target can never be satisfied, and a
            // pass/fail metric with one is meaningless - normalise both here so
            // the clients never have to guess.
            $data['requirements'] = collect($data['requirements'])->map(function ($r) {
                $counted = MonetizationProgram::METRICS[$r['key']]['counted'];
                return [
                    'key'    => $r['key'],
                    'label'  => $r['label'] ?: MonetizationProgram::METRICS[$r['key']]['label'],
                    'target' => $counted ? max(1, (float) ($r['target'] ?? 1)) : null,
                ];
            })->values()->all();
        }

        $before = $program->only(['mode', 'label', 'description', 'requirements', 'unlocks']);
        $program->fill($data)->save();
        MonetizationProgram::bustCache();

        AdminActionLog::record(
            admin: $request->user(),
            action: 'monetization_program_update',
            description: "Updated monetization programme {$program->label}",
            target: $program,
            metadata: ['key' => $program->key, 'before' => $before, 'after' => $data],
        );

        return response()->json([
            'success' => true,
            'message' => "{$program->label} updated.",
            'data'    => $program->toClientArray() + ['id' => $program->id],
        ]);
    }

    /**
     * PATCH /admin/monetization-programs/master
     *
     * The platform-wide kill switch. Off, every programme reads as coming_soon
     * on both surfaces regardless of its own mode - one control to stop money
     * moving without editing five rows.
     */
    public function setMaster(Request $request): JsonResponse
    {
        $data = $request->validate(['enabled' => ['required', 'boolean']]);

        AdminCoinSetting::setValue('monetization_enabled', $data['enabled'] ? '1' : '0');
        MonetizationProgram::bustCache();

        AdminActionLog::record(
            admin: $request->user(),
            action: 'monetization_master_switch',
            description: $data['enabled'] ? 'Enabled monetization platform-wide' : 'Disabled monetization platform-wide',
            metadata: ['enabled' => $data['enabled']],
            severity: $data['enabled'] ? 'info' : 'warning',
        );

        return response()->json([
            'success' => true,
            'message' => $data['enabled'] ? 'Monetization enabled.' : 'Monetization disabled platform-wide.',
            'data'    => ['enabled' => $data['enabled']],
        ]);
    }

    /**
     * PATCH /admin/monetization-programs/{key}/mode
     *
     * The toggle on the settings card. Separate from `update` so flipping a
     * programme on cannot accidentally carry a half-edited requirement list
     * with it.
     */
    public function setMode(Request $request, string $key): JsonResponse
    {
        $data = $request->validate([
            'mode' => ['required', Rule::in(MonetizationProgram::MODES)],
        ]);

        $program = MonetizationProgram::where('key', $key)->firstOrFail();
        $was = $program->mode;
        $program->update(['mode' => $data['mode']]);
        MonetizationProgram::bustCache();

        AdminActionLog::record(
            admin: $request->user(),
            action: 'monetization_program_mode',
            description: "Set {$program->label} to {$data['mode']}",
            target: $program,
            metadata: ['key' => $program->key, 'from' => $was, 'to' => $data['mode']],
        );

        /*
         * Keep the promise "Notify when available" made.
         *
         * Only on the transition INTO enabled: re-saving an already-enabled
         * program must not re-announce it, and the waitlist's notified_at
         * stamps make a second run a no-op anyway. Every user is re-checked
         * individually inside the notifier - opening a program does not make
         * everyone on its waitlist eligible for it.
         */
        $announced = null;
        if ($data['mode'] === 'enabled' && $was !== 'enabled') {
            $announced = app(ProgramWaitlistNotifier::class)->run($program->fresh());
        }

        return response()->json([
            'success' => true,
            'message' => "{$program->label} is now " . str_replace('_', ' ', $data['mode']) . '.'
                . ($announced ? " Notified {$announced['notified']} waitlisted user(s)." : ''),
            'data'    => $program->toClientArray() + ['id' => $program->id],
            'waitlist' => $announced,
        ]);
    }

    /**
     * PUT /admin/platform-requirements/{key}
     *
     * Edits one platform-wide rule. `enabled=false` stops it applying to
     * every programme immediately - `MonetizationEligibilityService` only
     * ever reads the enabled rows, live, on every request.
     */
    public function updateBaseline(Request $request, string $key): JsonResponse
    {
        $requirement = PlatformRequirement::where('key', $key)->firstOrFail();

        $data = $request->validate([
            'label'   => ['sometimes', 'string', 'max:80'],
            'sub'     => ['sometimes', 'nullable', 'string', 'max:150'],
            'target'  => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:1000000000'],
            'enabled' => ['sometimes', 'boolean'],
        ]);

        // A pass/fail rule with a target is meaningless - same normalisation
        // the per-programme requirements already get.
        if (array_key_exists('target', $data) && ! (MonetizationProgram::METRICS[$key]['counted'] ?? false)) {
            $data['target'] = null;
        }

        $before = $requirement->only(['label', 'sub', 'target', 'enabled']);
        $requirement->fill($data)->save();
        PlatformRequirement::bustCache();

        AdminActionLog::record(
            admin: $request->user(),
            action: 'platform_requirement_update',
            description: "Updated platform-wide requirement {$requirement->label}"
                . (array_key_exists('enabled', $data) ? ($data['enabled'] ? '' : ' (disabled)') : ''),
            metadata: ['key' => $requirement->key, 'before' => $before, 'after' => $data],
            severity: (array_key_exists('enabled', $data) && ! $data['enabled']) ? 'warning' : 'info',
        );

        return response()->json([
            'success' => true,
            'message' => "{$requirement->label} updated.",
            'data'    => $requirement->toClientArray(),
        ]);
    }
}
