<?php

namespace App\Services;

use App\Models\CountryAdminOverrideLog;
use App\Models\CountryChangeRequest;
use App\Models\CountryDetection;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Business logic for the 60-day country lock + continuous-verification flow.
 *
 *  - On signup we record the user-selected country and start a 60-day lock.
 *  - On every signup / login / heartbeat we run a detection and reconcile any
 *    active change request:
 *      • detected matches requested  → counter advances by elapsed time since
 *        verification_started_at; once ≥ 60 continuous days, status = eligible.
 *      • detected differs            → counter resets, status = pending.
 *  - To confirm a change the user must (a) have lock expired AND (b) have an
 *    eligible request. Confirm → new 60-day lock, request marked approved.
 *  - Admin override bypasses both checks but is always audit-logged.
 */
class CountryService
{
    public const LOCK_DAYS                = 60;
    public const REQUIRED_CONTINUOUS_DAYS = 60;

    public function __construct(private IpCountryService $ips) {}

    /* ───────────────────────────────────────────────────────────────────
       Signup: set initial country + lock + record detection.
    ─────────────────────────────────────────────────────────────────── */
    public function onSignup(User $user, Request $request, string $selectedCode): void
    {
        $selected = strtoupper($selectedCode);
        if (!IsoCountries::isValid($selected)) {
            $selected = IpCountryService::DEFAULT_COUNTRY_CODE;
        }
        $detection = $this->ips->lookup($request);

        $user->forceFill([
            'selected_country_code'     => $selected,
            'selected_country_name'     => IsoCountries::nameFor($selected),
            'detected_country_code'     => $detection['countryCode'],
            'detected_country_name'     => $detection['countryName'],
            'detected_asn_number'       => $detection['asnNumber'],
            'detected_isp_organization' => $detection['ispOrganization'],
            'country_locked_until'      => now()->addDays(self::LOCK_DAYS),
            'country_last_changed_at'   => now(),
            'country_change_status'     => 'none',
            // Keep legacy `country` column in sync for older read paths.
            'country'                   => IsoCountries::nameFor($selected),
        ])->save();

        // Seed a first-run language default from the country when the user is
        // still on the untouched 'en' default and the country maps elsewhere.
        if (in_array((string) $user->language, ['', 'en'], true)) {
            $lang = LanguageDefaults::forCountry($selected)
                ?: LanguageDefaults::forCountry($detection['countryCode']);
            if ($lang && $lang !== (string) $user->language) {
                $user->forceFill(['language' => $lang])->save();
            }
        }

        $this->storeDetection($user, $detection, 'signup');
    }

    /* ───────────────────────────────────────────────────────────────────
       Record a detection event (login / heartbeat / explicit check).
       Returns the detection payload so callers can echo it back.
    ─────────────────────────────────────────────────────────────────── */
    public function recordDetection(User $user, Request $request, string $source): array
    {
        $detection = $this->ips->lookup($request);

        // Capture the prior detected country BEFORE overwriting it, so callers
        // (login) can flag a sign-in from a new country as a risk signal.
        $previousCountry = $user->detected_country_code;
        $newCountryLogin = $previousCountry
            && strtoupper((string) $previousCountry) !== strtoupper((string) $detection['countryCode']);

        $user->forceFill([
            'detected_country_code'     => $detection['countryCode'],
            'detected_country_name'     => $detection['countryName'],
            'detected_asn_number'       => $detection['asnNumber'],
            'detected_isp_organization' => $detection['ispOrganization'],
        ])->save();

        $this->storeDetection($user, $detection, $source);
        $this->reconcileActiveRequest($user, $detection['countryCode']);

        $detection['previousCountryCode'] = $previousCountry;
        $detection['newCountryLogin']     = (bool) $newCountryLogin;

        return $detection;
    }

    private function storeDetection(User $user, array $d, string $source): void
    {
        CountryDetection::create([
            'user_id'                   => $user->id,
            'detected_country_code'     => $d['countryCode'],
            'detected_country_name'     => $d['countryName'],
            'detected_region'           => $d['region'] ?? null,
            'detected_city'             => $d['city'] ?? null,
            'detected_latitude'         => $d['latitude'] ?? null,
            'detected_longitude'        => $d['longitude'] ?? null,
            'detected_timezone'         => $d['timezone'] ?? null,
            'detected_asn_number'       => $d['asnNumber'],
            'detected_isp_organization' => $d['ispOrganization'],
            'detected_at'               => now(),
            'ip_hash'                   => $d['ipHash'],
            'source'                    => $source,
        ]);
    }

    /* ───────────────────────────────────────────────────────────────────
       Reconcile any active change request against the latest detection.
       Match  → advance counter (or start it).
       Miss   → reset counter.
    ─────────────────────────────────────────────────────────────────── */
    private function reconcileActiveRequest(User $user, string $detectedCode): void
    {
        /** @var CountryChangeRequest|null $req */
        $req = CountryChangeRequest::where('user_id', $user->id)
            ->whereIn('status', [CountryChangeRequest::STATUS_PENDING, CountryChangeRequest::STATUS_ELIGIBLE])
            ->latest('id')
            ->first();

        if (!$req) {
            return;
        }

        if (strtoupper($detectedCode) === strtoupper($req->requested_country_code)) {
            // Match: ensure counter is running.
            if ($req->verification_started_at === null) {
                $req->verification_started_at = now();
                $req->continuous_detected_days = 0;
            } else {
                $req->continuous_detected_days = (int) max(0, floor(now()->diffInSeconds($req->verification_started_at, true) / 86400));
            }

            if ($req->continuous_detected_days >= self::REQUIRED_CONTINUOUS_DAYS) {
                if ($req->status !== CountryChangeRequest::STATUS_ELIGIBLE) {
                    $req->status = CountryChangeRequest::STATUS_ELIGIBLE;
                    $req->eligible_at = now();

                    $user->forceFill([
                        'country_change_status'      => 'eligible',
                        'country_change_eligible_at' => now(),
                    ])->save();
                }
            }
            $req->save();
        } else {
            // Mismatch: full reset.
            $req->verification_started_at  = null;
            $req->continuous_detected_days = 0;
            $req->eligible_at              = null;
            $req->status                   = CountryChangeRequest::STATUS_PENDING;
            $req->save();

            $user->forceFill([
                'country_change_status'      => 'pending',
                'country_change_eligible_at' => null,
            ])->save();
        }
    }

    /* ───────────────────────────────────────────────────────────────────
       Build the public status payload returned by /user/country-status.
    ─────────────────────────────────────────────────────────────────── */
    public function statusFor(User $user): array
    {
        $now      = now();
        $until    = $user->country_locked_until ? Carbon::parse($user->country_locked_until) : null;
        $locked   = $until && $until->isFuture();
        $remaining = $locked ? (int) ceil($until->diffInSeconds($now, true) / 86400) : 0;

        $req = CountryChangeRequest::where('user_id', $user->id)
            ->whereIn('status', [CountryChangeRequest::STATUS_PENDING, CountryChangeRequest::STATUS_ELIGIBLE])
            ->latest('id')
            ->first();

        $canRequest = !$locked;
        $message    = $this->statusMessage($locked, $remaining, $req);

        return [
            'currentCountryCode'      => $user->selected_country_code,
            'currentCountryName'      => $user->selected_country_name,
            'detectedCountryCode'     => $user->detected_country_code,
            'detectedCountryName'     => $user->detected_country_name,
            'countryLockedUntil'      => $until?->toIso8601String(),
            'remainingLockDays'       => $remaining,
            'canRequestCountryChange' => $canRequest,
            'pendingRequestedCountry' => $req?->requested_country_code,
            'pendingRequestedName'    => $req?->requested_country_name,
            'continuousDetectedDays'  => (int) ($req?->continuous_detected_days ?? 0),
            'requiredContinuousDays'  => self::REQUIRED_CONTINUOUS_DAYS,
            'eligibleAt'              => $req?->eligible_at?->toIso8601String(),
            'status'                  => $req?->status ?? 'none',
            'message'                 => $message,
        ];
    }

    private function statusMessage(bool $locked, int $remaining, ?CountryChangeRequest $req): string
    {
        if ($locked) {
            return "Your country is locked for {$remaining} more day" . ($remaining === 1 ? '' : 's') .
                ' for security and content-region accuracy.';
        }
        if ($req && $req->status === CountryChangeRequest::STATUS_ELIGIBLE) {
            return 'You are eligible to confirm your country change.';
        }
        if ($req && $req->status === CountryChangeRequest::STATUS_PENDING) {
            return "Detected in requested country for {$req->continuous_detected_days}/" .
                self::REQUIRED_CONTINUOUS_DAYS . ' continuous days.';
        }
        return 'Your country lock has expired. You can request a country change.';
    }

    /* ───────────────────────────────────────────────────────────────────
       Create or refresh a pending change request.
    ─────────────────────────────────────────────────────────────────── */
    public function requestChange(User $user, Request $request, string $requestedCode): array
    {
        $requestedCode = strtoupper($requestedCode);
        if (!IsoCountries::isValid($requestedCode)) {
            return ['ok' => false, 'message' => 'Invalid country code.', 'status' => 422];
        }

        $until = $user->country_locked_until ? Carbon::parse($user->country_locked_until) : null;
        if ($until && $until->isFuture()) {
            $remaining = (int) ceil($until->diffInSeconds(now(), true) / 86400);
            return [
                'ok'      => false,
                'message' => "Your country is locked for {$remaining} more day" . ($remaining === 1 ? '' : 's') . '.',
                'status'  => 423,
            ];
        }

        if (strtoupper((string) $user->selected_country_code) === $requestedCode) {
            return ['ok' => false, 'message' => 'You are already on this country.', 'status' => 422];
        }

        // Cancel any older active request that targets a different country -
        // a user can only have one active request at a time.
        CountryChangeRequest::where('user_id', $user->id)
            ->whereIn('status', [CountryChangeRequest::STATUS_PENDING, CountryChangeRequest::STATUS_ELIGIBLE])
            ->where('requested_country_code', '!=', $requestedCode)
            ->update(['status' => CountryChangeRequest::STATUS_CANCELLED]);

        // Detect right now so the counter starts only if they're already there.
        $detection = $this->ips->lookup($request);

        /** @var CountryChangeRequest $req */
        $req = CountryChangeRequest::firstOrNew([
            'user_id'                => $user->id,
            'requested_country_code' => $requestedCode,
        ]);

        if (!$req->exists) {
            $req->current_country_code   = $user->selected_country_code;
            $req->requested_country_name = IsoCountries::nameFor($requestedCode);
            $req->status                 = CountryChangeRequest::STATUS_PENDING;
            $req->continuous_detected_days = 0;
        } else {
            // Re-opening a cancelled / rejected one - start fresh.
            $req->status                   = CountryChangeRequest::STATUS_PENDING;
            $req->continuous_detected_days = 0;
            $req->verification_started_at  = null;
            $req->eligible_at              = null;
            $req->approved_at              = null;
            $req->rejected_reason          = null;
        }

        if (strtoupper($detection['countryCode']) === $requestedCode) {
            $req->verification_started_at = now();
        }

        $req->save();

        $this->storeDetection($user, $detection, 'country_change_check');

        $user->forceFill([
            'country_change_status'      => 'pending',
            'country_change_eligible_at' => null,
        ])->save();

        return ['ok' => true, 'request' => $req->fresh(), 'status' => 201];
    }

    /* ───────────────────────────────────────────────────────────────────
       Confirm an eligible request → apply new country + restart 60-day lock.
    ─────────────────────────────────────────────────────────────────── */
    public function confirmChange(User $user): array
    {
        return DB::transaction(function () use ($user) {
            /** @var CountryChangeRequest|null $req */
            $req = CountryChangeRequest::where('user_id', $user->id)
                ->where('status', CountryChangeRequest::STATUS_ELIGIBLE)
                ->latest('id')
                ->lockForUpdate()
                ->first();

            if (!$req) {
                return ['ok' => false, 'message' => 'No eligible country change request found.', 'status' => 422];
            }

            $newCode = strtoupper($req->requested_country_code);
            $newName = $req->requested_country_name ?: IsoCountries::nameFor($newCode);

            $user->forceFill([
                'selected_country_code'      => $newCode,
                'selected_country_name'      => $newName,
                'country'                    => $newName,
                'country_locked_until'       => now()->addDays(self::LOCK_DAYS),
                'country_last_changed_at'    => now(),
                'country_change_eligible_at' => null,
                'country_change_status'      => 'none',
            ])->save();

            $req->status      = CountryChangeRequest::STATUS_APPROVED;
            $req->approved_at = now();
            $req->save();

            return ['ok' => true, 'request' => $req->fresh(), 'status' => 200];
        });
    }

    /* ───────────────────────────────────────────────────────────────────
       Admin override - bypass lock + continuous check. Always audit-logged.
       $lockMode: 'keep' | 'reset' | 'none'
    ─────────────────────────────────────────────────────────────────── */
    public function adminOverride(User $target, User $admin, string $newCode, string $reason, string $lockMode = 'reset'): array
    {
        $newCode = strtoupper($newCode);
        if (!IsoCountries::isValid($newCode)) {
            return ['ok' => false, 'message' => 'Invalid country code.', 'status' => 422];
        }
        if (mb_strlen(trim($reason)) < 4) {
            return ['ok' => false, 'message' => 'Reason is required (min 4 characters).', 'status' => 422];
        }
        if (!in_array($lockMode, ['keep', 'reset', 'none'], true)) {
            $lockMode = 'reset';
        }

        return DB::transaction(function () use ($target, $admin, $newCode, $reason, $lockMode) {
            $oldCode = $target->selected_country_code;
            $oldName = $target->selected_country_name;
            $newName = IsoCountries::nameFor($newCode);

            $patch = [
                'selected_country_code'      => $newCode,
                'selected_country_name'      => $newName,
                'country'                    => $newName,
                'country_last_changed_at'    => now(),
                'country_change_status'      => 'none',
                'country_change_eligible_at' => null,
                'admin_country_override'     => true,
                'admin_country_override_by'  => $admin->id,
                'admin_country_override_at'  => now(),
                'admin_country_override_reason' => mb_substr($reason, 0, 500),
            ];
            if ($lockMode === 'reset') {
                $patch['country_locked_until'] = now()->addDays(self::LOCK_DAYS);
            } elseif ($lockMode === 'none') {
                $patch['country_locked_until'] = null;
            } // 'keep' leaves country_locked_until untouched

            $target->forceFill($patch)->save();

            // Cancel any active request - admin's decision is final.
            CountryChangeRequest::where('user_id', $target->id)
                ->whereIn('status', [CountryChangeRequest::STATUS_PENDING, CountryChangeRequest::STATUS_ELIGIBLE])
                ->update(['status' => CountryChangeRequest::STATUS_CANCELLED]);

            $log = CountryAdminOverrideLog::create([
                'user_id'         => $target->id,
                'old_country_code'=> $oldCode,
                'old_country_name'=> $oldName,
                'new_country_code'=> $newCode,
                'new_country_name'=> $newName,
                'admin_id'        => $admin->id,
                'reason'          => mb_substr($reason, 0, 500),
                'lock_mode'       => $lockMode,
                'changed_at'      => now(),
            ]);

            return ['ok' => true, 'log' => $log, 'status' => 200];
        });
    }
}
