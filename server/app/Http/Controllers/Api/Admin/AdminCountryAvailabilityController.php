<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminActionLog;
use App\Models\AppSetting;
use App\Models\CountryAvailability;
use App\Models\User;
use App\Services\CountriesDev\CountriesDevGateway;
use App\Services\CountryAvailabilityService;
use App\Services\CountryRegions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * "REELSOO COUNTRY AVAILABILITY" admin page's backend. Gated by
 * permission:manage_country_availability (stacked on top of the standard
 * api.admin group every other admin route already sits behind - see
 * routes/api.php).
 */
class AdminCountryAvailabilityController extends Controller
{
    public function __construct(
        private CountryAvailabilityService $availability,
        private CountriesDevGateway $countriesDev,
    ) {}

    /** GET /admin/settings/country-availability */
    public function index(Request $request): JsonResponse
    {
        $query = CountryAvailability::query();

        if ($q = $request->get('q')) {
            $query->where(fn ($w) => $w
                ->where('country_name', 'like', "%{$q}%")
                ->orWhere('country_code', 'like', "%{$q}%"));
        }

        $status = $request->get('status', 'all');
        if ($status === 'enabled') {
            $query->where('signup_enabled', true)->where('login_enabled', true);
        } elseif ($status === 'disabled') {
            $query->where(fn ($w) => $w->where('signup_enabled', false)->orWhere('login_enabled', false));
        }

        $rows = $query->orderBy('country_name')->get();

        // Region is computed (CountryRegions::forCode()), not stored, so
        // this filters in PHP after the DB query rather than in SQL. Fine
        // at this scale (247 rows max before pagination narrows it further).
        $region = $request->get('region');
        if ($region && $region !== 'all') {
            $rows = $rows->filter(fn (CountryAvailability $c) => CountryRegions::forCode($c->country_code) === $region)->values();
        }

        $perPage = (int) $request->get('per_page', 50);
        $page    = (int) $request->get('page', 1);
        $total   = $rows->count();
        $slice   = $rows->slice(($page - 1) * $perPage, $perPage)->values();

        // Existing-user counts for just the codes on this page - not a
        // full-table scan every request.
        $pageCodes = $slice->pluck('country_code')->all();
        $userCounts = User::whereIn('selected_country_code', $pageCodes)
            ->select('selected_country_code', DB::raw('count(*) as cnt'))
            ->groupBy('selected_country_code')
            ->pluck('cnt', 'selected_country_code');

        $items = $slice->map(fn (CountryAvailability $c) => $this->present($c, (int) ($userCounts[$c->country_code] ?? 0)));

        return response()->json([
            'success' => true,
            'data'    => [
                'global'   => $this->globalSettings(),
                'stats'    => $this->stats(),
                'regions'  => CountryRegions::all(),
                'countries' => $items,
            ],
            'meta' => [
                'current_page' => $page,
                'last_page'    => $perPage > 0 ? (int) max(1, ceil($total / $perPage)) : 1,
                'total'        => $total,
            ],
        ]);
    }

    /** GET /admin/settings/country-availability/countries/{code} - detail drawer. */
    public function show(Request $request, string $code): JsonResponse
    {
        $code = strtoupper($code);
        $country = CountryAvailability::where('country_code', $code)->firstOrFail();

        $existingUsers = User::where('selected_country_code', $code)->count();

        $history = AdminActionLog::where('target_type', 'CountryAvailability')
            ->where('target_id', $country->id)
            ->orderByDesc('id')
            ->limit(20)
            ->with('admin:id,name,username')
            ->get()
            ->map(fn ($log) => $this->presentLog($log));

        return response()->json([
            'success' => true,
            'data'    => [
                'country'       => $this->present($country, $existingUsers),
                'existingUsers' => $existingUsers,
                'history'       => $history,
            ],
        ]);
    }

    /**
     * GET /admin/settings/country-availability/history - global audit feed
     * for this feature. Reuses AdminActionLog (the existing audit model
     * behind the /logs admin page) - no new audit table.
     */
    public function history(Request $request): JsonResponse
    {
        $paginator = AdminActionLog::whereIn('action', [
                'update_country_availability_global',
                'update_country_availability',
                'bulk_update_country_availability',
            ])
            ->orderByDesc('id')
            ->with('admin:id,name,username')
            ->paginate((int) $request->get('per_page', 20));

        return response()->json([
            'success' => true,
            'data'    => collect($paginator->items())->map(fn ($log) => $this->presentLog($log)),
            'meta'    => [
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
                'total'        => $paginator->total(),
            ],
        ]);
    }

    /**
     * GET /admin/settings/country-availability/provider-health
     * Read-only, no I/O to countries.dev - every value here is either a
     * config flag, the circuit breaker's own Cache-backed state, a lifetime
     * Cache counter, or the last scheduled sync's recorded summary. Reused
     * by the admin page's "Country Detection" card.
     */
    public function providerHealth(): JsonResponse
    {
        $metric = fn (string $name) => (int) Cache::get("countriesdev:metrics:{$name}", 0);

        return response()->json([
            'success' => true,
            'data'    => [
                'enabled'     => $this->countriesDev->isEnabled(),
                'circuitOpen' => $this->countriesDev->isCircuitOpen(),
                'metrics'     => [
                    'requests'            => $metric('requests'),
                    'success'             => $metric('success'),
                    'failures'            => $metric('failures'),
                    'cacheHits'           => $metric('cache_hits'),
                    'cacheMisses'         => $metric('cache_misses'),
                    'circuitOpenSkips'    => $metric('circuit_open'),
                    'concurrencyRejected' => $metric('concurrency_rejected'),
                ],
                'lastSync'    => [
                    'at'      => Cache::get('countriesdev:sync:last_run_at'),
                    'success' => Cache::get('countriesdev:sync:last_success_count'),
                    'skipped' => Cache::get('countriesdev:sync:last_skipped_count'),
                    'failed'  => Cache::get('countriesdev:sync:last_failure_count'),
                ],
            ],
        ]);
    }

    /** PUT /admin/settings/country-availability - global settings only. */
    public function updateGlobal(Request $request): JsonResponse
    {
        if ($conflict = $this->checkVersion($request)) {
            return $conflict;
        }

        $data = $request->validate([
            'country_restrictions_enabled' => ['sometimes', 'boolean'],
            'global_signup_enabled'        => ['sometimes', 'boolean'],
            'global_login_enabled'         => ['sometimes', 'boolean'],
            'country_existing_user_policy' => ['sometimes', 'string', Rule::in([
                CountryAvailabilityService::POLICY_ALLOW_EXISTING,
                CountryAvailabilityService::POLICY_RESTRICT_EXISTING,
                CountryAvailabilityService::POLICY_ALLOW_LOGIN_DISABLE_SIGNUP,
                CountryAvailabilityService::POLICY_REQUIRE_ADMIN_REVIEW,
            ])],
            'country_restriction_message'  => ['sometimes', 'string', 'max:500'],
            'show_restricted_countries'    => ['sometimes', 'boolean'],
            'allow_manual_country_change'  => ['sometimes', 'boolean'],
            'country_undetermined_signup_policy' => ['sometimes', 'string', Rule::in(['deny', 'allow'])],
        ]);

        $before = $this->globalSettings();
        $types = [
            'country_restrictions_enabled' => 'boolean',
            'global_signup_enabled'        => 'boolean',
            'global_login_enabled'         => 'boolean',
            'country_existing_user_policy' => 'string',
            'country_restriction_message'  => 'string',
            'show_restricted_countries'    => 'boolean',
            'allow_manual_country_change'  => 'boolean',
            'country_undetermined_signup_policy' => 'string',
        ];
        $changed = [];
        foreach ($data as $key => $value) {
            if ($before[$key] === $value) continue;
            AppSetting::set($key, $value, $types[$key]);
            $changed[$key] = ['old' => $before[$key], 'new' => $value];
        }

        if ($changed) {
            $this->availability->bumpPolicyVersion();
            AdminActionLog::record(
                admin: $request->user(),
                action: 'update_country_availability_global',
                category: 'settings',
                description: 'Updated country availability global settings ('
                    . implode(', ', array_keys($changed)) . ').',
                metadata: $changed,
                ip: $request->ip(),
            );
        }

        return response()->json(['success' => true, 'data' => $this->globalSettings()]);
    }

    /** PUT /admin/settings/country-availability/countries/{code} */
    public function updateCountry(Request $request, string $code): JsonResponse
    {
        if ($conflict = $this->checkVersion($request)) {
            return $conflict;
        }

        $code = strtoupper($code);
        $country = CountryAvailability::where('country_code', $code)->firstOrFail();

        $data = $request->validate([
            'signup_enabled'     => ['sometimes', 'boolean'],
            'login_enabled'      => ['sometimes', 'boolean'],
            'restriction_reason' => ['sometimes', 'nullable', 'string', 'max:500'],
        ]);

        $before = ['signup_enabled' => $country->signup_enabled, 'login_enabled' => $country->login_enabled];

        $country->fill($data);
        $country->updated_by = $request->user()->id;
        $country->save();

        $changedFields = array_filter($data, fn ($v, $k) =>
            in_array($k, ['signup_enabled', 'login_enabled'], true) && ($before[$k] ?? null) !== $v,
        ARRAY_FILTER_USE_BOTH);

        if ($changedFields) {
            $this->availability->bumpPolicyVersion();
            $this->availability->forgetCountryPolicy($code);
            AdminActionLog::record(
                admin: $request->user(),
                action: 'update_country_availability',
                category: 'settings',
                description: "Updated {$country->country_name} ({$code}) availability.",
                target: $country,
                metadata: array_map(fn ($new, $key) => ['old' => $before[$key], 'new' => $new], $changedFields, array_keys($changedFields)),
                ip: $request->ip(),
            );
        }

        $existingUsers = User::where('selected_country_code', $code)->count();

        return response()->json(['success' => true, 'data' => $this->present($country->fresh(), $existingUsers)]);
    }

    /**
     * POST /admin/settings/country-availability/bulk
     * Body: { codes: string[], action: enable_signup|disable_signup|enable_login|disable_login }
     * "Select All"/"Clear All" are the client sending every code (or the
     * full known list) with the appropriate action - no separate endpoint,
     * so the same confirm-then-bulk path handles both.
     */
    public function bulk(Request $request): JsonResponse
    {
        if ($conflict = $this->checkVersion($request)) {
            return $conflict;
        }

        $data = $request->validate([
            'codes'   => ['required', 'array', 'min:1'],
            'codes.*' => ['string', 'size:2'],
            'action'  => ['required', 'string', Rule::in([
                'enable_signup', 'disable_signup', 'enable_login', 'disable_login',
            ])],
        ]);

        $codes = array_map('strtoupper', $data['codes']);
        [$field, $value] = match ($data['action']) {
            'enable_signup'  => ['signup_enabled', true],
            'disable_signup' => ['signup_enabled', false],
            'enable_login'   => ['login_enabled', true],
            'disable_login'  => ['login_enabled', false],
        };

        $affected = CountryAvailability::whereIn('country_code', $codes)
            ->update([$field => $value, 'updated_by' => $request->user()->id, 'updated_at' => now()]);

        if ($affected > 0) {
            $this->availability->bumpPolicyVersion();
            foreach ($codes as $code) {
                $this->availability->forgetCountryPolicy($code);
            }
            // One summarizing entry, not one per country - a Select All/
            // Clear All over ~247 rows must not spam the audit log.
            AdminActionLog::record(
                admin: $request->user(),
                action: 'bulk_update_country_availability',
                category: 'settings',
                description: "Bulk {$data['action']} for {$affected} countr" . ($affected === 1 ? 'y' : 'ies') . '.',
                metadata: [
                    'action' => $data['action'],
                    'count'  => $affected,
                    'codes'  => array_slice($codes, 0, 25),
                    'truncated' => count($codes) > 25,
                ],
                ip: $request->ip(),
            );
        }

        return response()->json(['success' => true, 'data' => ['affected' => $affected]]);
    }

    /**
     * Lightweight optimistic lock, reusing the policy_version counter every
     * write already bumps - not a new locking system. `expected_version` is
     * OPTIONAL: a caller that doesn't send it (an older client, or a script)
     * still works, it just skips the conflict check. The admin UI always
     * sends the version it last read.
     */
    private function checkVersion(Request $request): ?JsonResponse
    {
        if (!$request->has('expected_version')) {
            return null;
        }
        $expected = (int) $request->input('expected_version');
        $current  = $this->availability->policyVersion();
        if ($expected !== $current) {
            return response()->json([
                'success' => false,
                'code'    => 'STALE_VERSION',
                'message' => 'These settings were updated by another administrator. Please review the latest changes before saving.',
                'currentVersion' => $current,
            ], 409);
        }
        return null;
    }

    private function stats(): array
    {
        $total = CountryAvailability::count();
        $allowed = CountryAvailability::where('signup_enabled', true)->where('login_enabled', true)->count();
        return [
            'total'         => $total,
            'allowed'       => $allowed,
            'restricted'    => $total - $allowed,
            'existingUsers' => User::whereNotNull('selected_country_code')->count(),
        ];
    }

    private function globalSettings(): array
    {
        return [
            'country_restrictions_enabled' => $this->availability->restrictionsEnabled(),
            'global_signup_enabled'        => $this->availability->globalSignupEnabled(),
            'global_login_enabled'         => $this->availability->globalLoginEnabled(),
            'country_existing_user_policy' => $this->availability->existingUserPolicy(),
            'country_restriction_message'  => $this->availability->restrictionMessage(),
            'country_detection_mode'       => $this->availability->detectionMode(),
            'show_restricted_countries'    => $this->availability->showRestrictedCountries(),
            'allow_manual_country_change'  => $this->availability->allowManualCountryChange(),
            'country_undetermined_signup_policy' => $this->availability->undeterminedSignupPolicy(),
            'policy_version'               => $this->availability->policyVersion(),
        ];
    }

    private function present(CountryAvailability $c, int $existingUsers = 0): array
    {
        return [
            'code'               => $c->country_code,
            'name'               => $c->country_name,
            'region'             => CountryRegions::forCode($c->country_code),
            'signup_enabled'     => $c->signup_enabled,
            'login_enabled'      => $c->login_enabled,
            'restriction_reason' => $c->restriction_reason,
            'status'             => $c->signup_enabled && $c->login_enabled ? 'available' : 'restricted',
            'existing_users'     => $existingUsers,
            'updated_at'         => $c->updated_at?->toIso8601String(),
        ];
    }

    private function presentLog(AdminActionLog $log): array
    {
        return [
            'id'          => $log->id,
            'admin'       => $log->admin ? ['id' => $log->admin->id, 'name' => $log->admin->name, 'username' => $log->admin->username] : null,
            'action'      => $log->action,
            'description' => $log->description,
            'metadata'    => $log->metadata,
            'created_at'  => $log->created_at?->toIso8601String(),
        ];
    }
}
