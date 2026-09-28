<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CountryAvailability;
use App\Models\CountryDetection;
use App\Models\CountryResidencyDocument;
use App\Models\User;
use App\Services\CountryAvailabilityService;
use App\Services\CountryService;
use App\Services\IpCountryService;
use App\Services\IsoCountries;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class CountryController extends Controller
{
    public function __construct(
        private IpCountryService $ips,
        private CountryService   $countries,
        private StorageService   $storage,
        private CountryAvailabilityService $availability,
    ) {}

    /**
     * Public: GET /api/v1/detect-country
     * Used by the signup AND login pages to pre-fill the country dropdown
     * and show the "unavailable in your country" banner. Never exposes the
     * IP. Falls back to NP if everything fails.
     *
     * signupAllowed/loginAllowed are UX signals only - the real enforcement
     * happens again, independently, inside ApiAuthController's register()/
     * login()/completeSocial() at submit time (see CountryAvailabilityService's
     * own docblock: frontend is never the security boundary).
     */
    public function detect(Request $request): JsonResponse
    {
        $d = $this->ips->lookup($request);
        $signup = $this->availability->signupAllowedForCode($d['countryCode'], (bool) $d['reliable']);
        $login  = $this->availability->loginAllowedForCode($d['countryCode'], true);

        return response()->json([
            'success' => true,
            'data'    => [
                'countryCode'     => $d['countryCode'],
                'countryName'     => $d['countryName'],
                'asnNumber'       => $d['asnNumber'],
                'ispOrganization' => $d['ispOrganization'],
                'source'          => $d['source'],
                'reliable'        => $d['reliable'],
                'restrictionsEnabled' => $this->availability->restrictionsEnabled(),
                'signupAllowed'       => $signup['allowed'],
                'signupReason'        => $signup['reason'],
                'loginAllowed'        => $login['allowed'],
                'loginReason'         => $login['reason'],
                'policyVersion'       => $this->availability->policyVersion(),
                'allowManualCountryChange' => $this->availability->allowManualCountryChange(),
            ],
        ]);
    }

    /**
     * Public: GET /api/v1/countries/availability
     * Every country's signup availability (NOT login - the dropdown this
     * feeds is the signup country picker only), so a restricted country can
     * be shown visibly-but-disabled instead of silently hidden - UNLESS the
     * admin's "Show Restricted Countries" setting is off, in which case
     * disabled ones are left out of this response entirely (still UX only;
     * the backend's allow/deny decision at submit time is unaffected either
     * way). Cheap and cacheable - non-sensitive, no per-request IP work.
     */
    public function availabilityList(): JsonResponse
    {
        $version = $this->availability->policyVersion();
        $showRestricted = $this->availability->showRestrictedCountries();
        $rows = Cache::remember("country_avail_list:{$version}:" . ($showRestricted ? '1' : '0'), 3600, function () use ($showRestricted) {
            $query = CountryAvailability::orderBy('country_name');
            if (!$showRestricted) {
                $query->where('signup_enabled', true);
            }
            return $query->get(['country_code', 'country_name', 'signup_enabled'])
                ->map(fn ($c) => [
                    'code'    => $c->country_code,
                    'name'    => $c->country_name,
                    'enabled' => (bool) $c->signup_enabled,
                ]);
        });

        return response()->json([
            'success' => true,
            'data'    => [
                'restrictionsEnabled' => $this->availability->restrictionsEnabled(),
                'policyVersion'       => $version,
                'countries'           => $rows,
            ],
        ]);
    }

    /**
     * Authed: GET /api/v1/user/country-status
     */
    public function status(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        return response()->json([
            'success' => true,
            'data'    => $this->countries->statusFor($user),
        ]);
    }

    /**
     * Authed: POST /api/v1/user/request-country-change
     * Body: { country_code: "IN" }
     */
    public function requestChange(Request $request): JsonResponse
    {
        $request->validate([
            'country_code' => ['required', 'string', 'size:2'],
        ]);

        /** @var User $user */
        $user = $request->user();
        $result = $this->countries->requestChange($user, $request, $request->input('country_code'));

        if (!$result['ok']) {
            return response()->json([
                'success' => false,
                'message' => $result['message'],
            ], $result['status']);
        }

        return response()->json([
            'success' => true,
            'message' => 'Country change request started. Continuous verification in progress.',
            'data'    => $this->countries->statusFor($user->fresh()),
        ], $result['status']);
    }

    /**
     * Authed: POST /api/v1/user/confirm-country-change
     */
    public function confirmChange(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $result = $this->countries->confirmChange($user);

        if (!$result['ok']) {
            return response()->json([
                'success' => false,
                'message' => $result['message'],
            ], $result['status']);
        }

        return response()->json([
            'success' => true,
            'message' => 'Country updated. Your new country is locked for 60 days.',
            'data'    => $this->countries->statusFor($user->fresh()),
        ]);
    }

    /**
     * Authed: POST /api/v1/user/country-heartbeat
     * Frontend pings this once per day per session. We dedupe so heartbeat
     * sources only insert one row per user per calendar day; other sources
     * (login, signup, request-change) always go in.
     */
    public function heartbeat(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $alreadyToday = CountryDetection::where('user_id', $user->id)
            ->where('source', 'web_open')
            ->whereDate('detected_at', now()->toDateString())
            ->exists();

        if ($alreadyToday) {
            return response()->json([
                'success' => true,
                'data'    => $this->countries->statusFor($user),
                'cached'  => true,
            ]);
        }

        $this->countries->recordDetection($user, $request, 'web_open');

        return response()->json([
            'success' => true,
            'data'    => $this->countries->statusFor($user->fresh()),
        ]);
    }

    /**
     * Authed: GET /api/v1/user/country-residency-documents
     * List the current user's residency-proof submissions (newest first).
     */
    public function listResidencyDocuments(Request $request): JsonResponse
    {
        $docs = CountryResidencyDocument::where('user_id', $request->user()->id)
            ->orderByDesc('id')
            ->get()
            ->map(fn ($d) => [
                'id'                     => $d->id,
                'requested_country_code' => $d->requested_country_code,
                'requested_country_name' => $d->requested_country_name,
                'document_type'          => $d->document_type,
                'file_name'              => $d->file_original_name,
                'file_url'               => $this->storage->temporaryUrl($d->file_path, 30),
                'residing_since'         => $d->residing_since?->toDateString(),
                'user_note'              => $d->user_note,
                'status'                 => $d->status,
                'review_notes'           => $d->review_notes,
                'reviewed_at'            => $d->reviewed_at?->toIso8601String(),
                'submitted_at'           => $d->created_at?->toIso8601String(),
            ]);

        return response()->json(['success' => true, 'data' => $docs]);
    }

    /**
     * Authed: POST /api/v1/user/country-residency-documents
     * Upload a residency-proof document for a manual country change.
     */
    public function submitResidencyDocument(Request $request): JsonResponse
    {
        $request->validate([
            'country_code'   => ['required', 'string', 'size:2'],
            'document_type'  => ['required', 'string', 'in:' . implode(',', CountryResidencyDocument::ACCEPTED_TYPES)],
            'document'       => ['required', 'file', 'max:10240', 'mimes:jpeg,jpg,png,webp,pdf'],
            'residing_since' => ['required', 'date', 'before_or_equal:today'],
            'note'           => ['nullable', 'string', 'max:500'],
        ]);

        $code = strtoupper($request->input('country_code'));
        if (!IsoCountries::isValid($code)) {
            return response()->json(['success' => false, 'message' => 'Invalid country code.'], 422);
        }

        // Must claim at least 60 days of residency.
        $residingSince = \Carbon\Carbon::parse($request->input('residing_since'));
        $daysSince     = $residingSince->diffInDays(now());
        if ($daysSince < CountryService::REQUIRED_CONTINUOUS_DAYS) {
            return response()->json([
                'success' => false,
                'message' => 'You must have been residing in the new country for at least '
                    . CountryService::REQUIRED_CONTINUOUS_DAYS . ' days to qualify.',
            ], 422);
        }

        /** @var User $user */
        $user = $request->user();
        if (strtoupper((string) $user->selected_country_code) === $code) {
            return response()->json([
                'success' => false,
                'message' => 'You are already on this country.',
            ], 422);
        }

        $file = $request->file('document');
        $key  = $this->storage->storeDocument($file, 'country-residency');

        $doc = CountryResidencyDocument::create([
            'user_id'                => $user->id,
            'requested_country_code' => $code,
            'requested_country_name' => IsoCountries::nameFor($code),
            'document_type'          => $request->input('document_type'),
            'file_path'              => $key,
            'file_original_name'     => $file->getClientOriginalName(),
            'file_mime'              => $file->getMimeType(),
            'file_size_bytes'        => $file->getSize(),
            'residing_since'         => $residingSince->toDateString(),
            'user_note'              => $request->input('note'),
            'status'                 => CountryResidencyDocument::STATUS_PENDING_REVIEW,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Document uploaded. Our team will review it within 1–3 business days.',
            'data'    => [
                'id'                     => $doc->id,
                'requested_country_code' => $doc->requested_country_code,
                'requested_country_name' => $doc->requested_country_name,
                'document_type'          => $doc->document_type,
                'file_name'              => $doc->file_original_name,
                'status'                 => $doc->status,
                'submitted_at'           => $doc->created_at?->toIso8601String(),
            ],
        ], 201);
    }

    /**
     * Admin-only: POST /api/v1/admin/users/{id}/country-override
     * Body: { country_code: "IN", reason: "...", lock_mode: "keep|reset|none" }
     */
    public function adminOverride(Request $request, int $userId): JsonResponse
    {
        $request->validate([
            'country_code' => ['required', 'string', 'size:2'],
            'reason'       => ['required', 'string', 'min:4', 'max:500'],
            'lock_mode'    => ['nullable', 'string', 'in:keep,reset,none'],
        ]);

        $target = User::findOrFail($userId);
        /** @var User $admin */
        $admin = $request->user();

        $result = $this->countries->adminOverride(
            $target,
            $admin,
            $request->input('country_code'),
            $request->input('reason'),
            $request->input('lock_mode', 'reset'),
        );

        if (!$result['ok']) {
            return response()->json([
                'success' => false,
                'message' => $result['message'],
            ], $result['status']);
        }

        return response()->json([
            'success' => true,
            'message' => 'Country override applied and audit-logged.',
            'data'    => [
                'log'    => $result['log'],
                'user'   => $target->fresh()->only([
                    'id', 'selected_country_code', 'selected_country_name',
                    'country_locked_until', 'admin_country_override',
                ]),
                'status' => $this->countries->statusFor($target->fresh()),
            ],
        ]);
    }
}
