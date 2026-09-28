<?php

namespace App\Services;

use App\Models\CreatorAgreement;
use App\Models\CreatorMonetizationStatus;
use App\Models\CreatorStrike;
use App\Models\CreatorAnalytic;
use App\Models\TaxForm;
use App\Models\CreatorProgramStatus;
use App\Models\MonetizationProgram;
use App\Models\PlatformRequirement;
use App\Models\User;
use App\Models\VerificationRequest;
use App\Models\Video;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * The one place a creator's monetization eligibility is decided.
 *
 * Every requirement on every programme is measured here, against live data, in
 * one pass. The app, the website, the admin console and the background job all
 * call this - so there is exactly one answer to "can this creator earn from
 * this", and no surface can drift from another.
 *
 * Two rules the whole design rests on:
 *
 *  1. COMPUTED IS THE TRUTH. Eligibility is derived on every read, never looked
 *     up. `creator_program_status` is a persisted SNAPSHOT for history, cheap
 *     lookups and transition detection - it is never what a creator is shown.
 *     A missed event can therefore make the snapshot stale, but it can never
 *     make the app show the wrong thing.
 *
 *  2. NOTHING IS APPLIED FOR. A creator who meets every requirement of an
 *     enabled programme is unlocked the instant it is measured. There is no
 *     queue, no approval, and no way for a creator to be eligible-but-waiting
 *     because someone forgot to press a button.
 */
class MonetizationEligibilityService
{
    /* ── Status vocabulary ──────────────────────────────────────────────
       active     admin enabled + every requirement met
       eligible   every requirement met, but the admin has not opened it
       locked     one or more requirements unmet
       coming_soon admin has it on coming soon and the creator is not there yet
       disabled   hidden globally
       ── */
    public const ACTIVE      = 'active';
    public const ELIGIBLE    = 'eligible';
    public const LOCKED      = 'locked';
    public const COMING_SOON = 'coming_soon';
    public const DISABLED    = 'disabled';

    /**
     * Every metric a requirement can be measured against, for one creator.
     *
     * Read together so a page's numbers all come from the same instant.
     * Fetching them separately let followers and views come from two different
     * moments, which showed as a checklist that disagreed with itself.
     */
    public function metrics(User $user): array
    {
        $since = now()->subDays(30)->toDateString();

        $publicVideos = (int) Video::where('user_id', $user->id)
            ->where('status', 'published')->whereNull('deleted_at')->count();

        $totalViews = (int) Video::where('user_id', $user->id)
            ->where('status', 'published')->whereNull('deleted_at')->sum('views_count');

        $window = CreatorAnalytic::where('user_id', $user->id)
            ->where('date', '>=', $since)
            ->selectRaw('COALESCE(SUM(views),0) v, COALESCE(SUM(watch_time_mins),0) w,
                         COALESCE(SUM(likes),0) l, COALESCE(SUM(comments),0) c, COALESCE(SUM(shares),0) s')
            ->first();

        $windowViews = (int) ($window->v ?? 0);
        $engagement = $windowViews > 0
            ? round(((($window->l ?? 0) + ($window->c ?? 0) + ($window->s ?? 0)) / $windowViews) * 100, 2)
            : 0.0;

        /* Identity.
           `users.is_verified` is the LIVE badge flag - the one thing that decides
           whether a tick renders anywhere in the product - so it is the primary
           signal, and it already goes false when a badge lapses or is revoked.
           The request is a fallback for the window between an approval and the
           flag being written, and it has to repeat every check the flag encodes:
           not revoked, and either permanent or not past its expiry. Without the
           expiry test a creator whose verification had run out would keep
           counting as identity-verified forever. */
        $identity = (bool) $user->is_verified
            || VerificationRequest::where('user_id', $user->id)
                ->where('status', 'approved')
                ->whereNull('revoked_at')
                ->where(function ($q) {
                    /* A free identity check never expires: there is no
                       subscription behind it to lapse. Only a badge carries an
                       expiry, so only a badge is tested for one. */
                    $q->where('purpose', VerificationRequest::PURPOSE_IDENTITY)
                      ->orWhere('is_permanent', true)
                      ->orWhereNull('expires_at')
                      ->orWhere('expires_at', '>', now());
                })
                ->exists();

        /* Every field Settings -> Profile Information actually shows and lets
           someone edit (ProfileInfoScreen.tsx's row list) - not a subset of
           it, so "complete" here means the same thing it means on that
           screen. This used to check $user->profile?->category, a LEGACY
           singular mirror column that the app's own category editor
           (EditCategory) never writes to any more - it posts `categories`
           (plural, an array, the real column on `users`) instead. A creator
           who filled in every field on Profile Information, including a
           category, still failed this check forever, because the one column
           it read was never the one being written. */
        $profileComplete = ! is_null($user->avatar)
            && ! empty(trim($user->name ?? ''))
            && ! empty(trim($user->username ?? ''))
            && ! empty(trim($user->bio ?? ''))
            && ! empty($user->categories)
            && ! empty($user->gender)
            && ! is_null($user->date_of_birth)
            && ! empty(trim($user->email ?? ''))
            && ! empty(trim($user->phone ?? ''))
            && ! empty(trim($user->location ?? ''));

        /* Posting streak: consecutive recent months with at least two public
           posts, counted backwards from this month. Stops at the first month
           that falls short, because a "streak" with a gap in it is not one. */
        $streak = 0;
        for ($i = 0; $i < 12; $i++) {
            $from = now()->subMonthsNoOverflow($i)->startOfMonth();
            $to   = (clone $from)->endOfMonth();
            $n = Video::where('user_id', $user->id)
                ->where('status', 'published')->whereNull('deleted_at')
                ->whereBetween('created_at', [$from, $to])->count();
            if ($n < 2) break;
            $streak++;
        }

        /* 18+ from the stated date of birth. A missing DOB is NOT 18 - the
           requirement is "verified", and no answer is not an answer. */
        $adult = $user->date_of_birth
            && \Carbon\Carbon::parse($user->date_of_birth)->diffInYears(now()) >= 18;

        // Terms a creator has actually accepted, one query for all of them.
        $agreed = CreatorAgreement::where('user_id', $user->id)->pluck('key')->flip();

        return [
            'followers'    => (int) ($user->profile?->total_followers ?? 0),
            'streak'       => $streak,
            'age18'        => $adult ? 1 : 0,
            // An approved tax form, which is the same gate requestWithdraw
            // enforces before releasing any payout.
            'tax'          => TaxForm::where('user_id', $user->id)
                                ->where('status', 'approved')->exists() ? 1 : 0,
            /* Strikes and brand-safety flags: active means issued, unexpired
               and not cleared by an upheld appeal. Distinct from `guidelines`,
               which is the blunt account-level ban - a creator can carry one
               strike without being banned, and the spec gates on the strike. */
            'strikes'      => CreatorStrike::where('user_id', $user->id)
                                ->where('type', CreatorStrike::TYPE_GUIDELINE)
                                ->active()->exists() ? 0 : 1,
            'brand_safety' => CreatorStrike::where('user_id', $user->id)
                                ->where('type', CreatorStrike::TYPE_BRAND_SAFETY)
                                ->active()->exists() ? 0 : 1,
            // Fortify's own signal: a secret that was generated but never
            // confirmed is not 2FA, it is an abandoned setup screen.
            'two_factor'   => $user->two_factor_confirmed_at ? 1 : 0,
            /* One monetized account per person.
               Checked on the signals that actually identify a person rather
               than an account: the payout destination money would be sent to,
               and the device the account was created on. A shared payout
               account is the one that matters - two profiles paying into the
               same eSewa or bank account is the definition of the thing this
               rule exists to stop. Absence of a signal is a PASS, not a fail:
               a creator who has not added a payout method yet has not done
               anything wrong. */
            'unique_account' => $this->isUniqueAccount($user) ? 1 : 0,
            'pledge'       => $agreed->has('content_pledge') ? 1 : 0,
            'merchant'     => $agreed->has('merchant_terms') ? 1 : 0,
            'disclosure'   => $agreed->has('affiliate_disclosure') ? 1 : 0,
            'videos'       => $publicVideos,
            'views_total'  => $totalViews,
            'views30'      => $windowViews,
            'watch30'      => (int) ($window->w ?? 0),
            'engagement30' => $engagement,
            'age'          => (int) ($user->created_at?->diffInDays(now()) ?? 0),
            'identity'     => $identity ? 1 : 0,
            'profile'      => $profileComplete ? 1 : 0,
            /* Email verification ONLY.
               This used to accept `phone !== null` as well, copied from the
               become-a-creator checklist. There is no phone verification
               anywhere in this platform - no OTP table, no phone_verified_at
               column - so a phone number is a string somebody typed. Treating
               it as proof let an account with an UNVERIFIED email pass a
               verification requirement, which is exactly what this gate is for.
               If phone verification is built, add the column and OR it here. */
            'email'        => ! is_null($user->email_verified_at) ? 1 : 0,
            // Dynamic: a violation suspends access the moment it lands, and
            // restores it the moment it is lifted. Nothing is manual.
            'guidelines'   => $user->is_banned ? 0 : 1,
        ];
    }

    /**
     * Is this the only monetized account for this person?
     *
     * Two signals, both of which identify a HUMAN rather than a login:
     *   - the payout destination: two accounts paying into one eSewa, Khalti or
     *     bank account are one person by definition
     *   - the signup device hash: the same handset creating a second account
     *
     * A missing signal passes. A creator who has not added a payout method has
     * not done anything wrong, and failing them for it would block every new
     * creator on the platform.
     */
    private function isUniqueAccount(User $user): bool
    {
        $mine = DB::table('creator_payout_methods')
            ->where('user_id', $user->id)
            ->get(['account_email', 'masked_account']);

        foreach ($mine as $m) {
            $clash = DB::table('creator_payout_methods')
                ->where('user_id', '!=', $user->id)
                ->where(function ($q) use ($m) {
                    if ($m->account_email)  $q->orWhere('account_email', $m->account_email);
                    if ($m->masked_account) $q->orWhere('masked_account', $m->masked_account);
                })
                ->exists();

            if ($clash) return false;
        }

        if ($user->signup_device_hash) {
            $shared = DB::table('users')
                ->where('id', '!=', $user->id)
                ->where('signup_device_hash', $user->signup_device_hash)
                ->where('role', 'creator')
                ->exists();

            if ($shared) return false;
        }

        return true;
    }

    /**
     * One programme, measured. Returns the resolved requirement rows plus the
     * counts and the status a client should render.
     */
    public function evaluateProgram(
        MonetizationProgram $program,
        array $metrics,
        int $userId,
        ?string $country = null,
    ): array {
        $row = $program->toClientArray();
        $reqs = [];

        /* Baseline rules first, then the programme's own.
           A creator is ineligible for ANY programme unless every enabled
           platform-wide rule holds, so they are prepended to every list
           rather than duplicated into five editable ones - raising (or, now,
           lowering) the platform bar is a single admin-editable change, not
           five. A rule an admin has turned off here is skipped entirely: it
           stops applying to every programme, immediately. */
        $rules = [];
        foreach (PlatformRequirement::active() as $b) {
            $rules[$b->key] = [
                'key'    => $b->key,
                'label'  => $b->label,
                'sub'    => $b->sub,
                'target' => $b->target,
            ] + [
                'counted'  => MonetizationProgram::METRICS[$b->key]['counted'],
                'baseline' => true,
            ];
        }

        /* A programme may repeat a metric the baseline already covers - Gifts
           asks for 7 days where the baseline asks for 30. Keyed by metric and
           merged on the STRICTER target, so the row appears exactly once and
           states the bar a creator actually has to clear. Two rows for the same
           metric was also a duplicate React key, which is what made the app
           warn about children sharing the key `age`. */
        foreach ($row['requirements'] as $r) {
            $key = $r['key'];
            if (! isset($rules[$key])) {
                $rules[$key] = $r + ['baseline' => false];
                continue;
            }

            $existing = $rules[$key];
            $keepProgramme = (float) ($r['target'] ?? 0) > (float) ($existing['target'] ?? 0);

            $rules[$key] = ($keepProgramme ? $r : $existing) + [
                // Still a baseline rule: it applies to every programme whichever
                // wording and target won.
                'baseline' => true,
                'counted'  => $existing['counted'],
                'sub'      => $existing['sub'] ?? ($r['sub'] ?? null),
            ];
        }

        $rules = array_values($rules);

        /* `region` is the only rule that depends on the programme rather than
           the creator alone: it asks whether THIS programme runs where they
           are. Resolved here because `metrics` has no programme to ask about. */
        $metrics['region'] = $program->allowsCountry($country) ? 1 : 0;

        foreach ($rules as $r) {
            $counted = $r['counted'] ?? MonetizationProgram::METRICS[$r['key']]['counted'] ?? false;
            $target  = $counted ? (float) ($r['target'] ?? 1) : 1.0;
            $current = (float) ($metrics[$r['key']] ?? 0);
            $met     = $current >= $target;

            $blocker = in_array($r['key'], MonetizationProgram::BLOCKER_METRICS, true);

            $reqs[] = array_merge($r, [
                'id'       => $r['key'],
                'sub'      => $r['sub'] ?? null,
                'current'  => $current,
                'met'      => $met,
                'pct'      => $target > 0 ? min(100, round(($current / $target) * 100, 1)) : 0,
                /* Two failure kinds, as specified. `progress` is something a
                   creator can work toward; `blocker` needs an appeal, a
                   document or a settings change, and no amount of posting
                   clears it. Only blockers are ever drawn in red. */
                'kind'     => $met ? 'met' : ($blocker ? 'blocker' : 'progress'),
                'action'   => $met ? null : (MonetizationProgram::METRIC_ACTIONS[$r['key']] ?? null),
            ]);
        }

        $metCount = count(array_filter($reqs, fn ($r) => $r['met']));
        $total    = count($reqs);

        // A programme with no requirements is open to everyone once enabled -
        // `allMet` is true rather than false, because "nothing to meet" is met.
        $allMet = $total === 0 || $metCount === $total;

        // The mode after the operator controls that can only narrow it:
        // master switch, schedule, country, rollout.
        $mode = $program->effectiveMode($userId, $country);

        /* A removed enrolment outranks the metrics.
           "Two consecutive failed months removes enrolment" and "two unfulfilled
           briefs remove the creator for 180 days" both mean the programme stays
           shut even once the numbers recover - otherwise a creator bounces back
           in the moment they re-qualify and the removal meant nothing. A purely
           computed engine cannot express this, which is why it is stored. */
        $removed = CreatorProgramStatus::where('user_id', $userId)
            ->where('program_key', $program->key)
            ->whereNotNull('reenrol_after')
            ->where('reenrol_after', '>', now())
            ->first();

        /* array_merge, NOT `+`: the union operator keeps the LEFT operand, so
           `$row + [...]` silently threw away the measured requirement rows and
           handed back the raw ones with no current/met/pct on them. */
        return array_merge($row, [
            'mode'         => $mode,
            'requirements' => $reqs,
            'met_count'    => $metCount,
            'total_count'  => $total,
            'percent'      => $total ? (int) round(($metCount / $total) * 100) : 100,
            'status'       => $removed ? self::LOCKED : $this->status($mode, $allMet),
            'all_met'      => $allMet,
            'enrolment_removed_until' => $removed?->reenrol_after?->toIso8601String(),
        ]);
    }

    /**
     * The status table, exactly as specified.
     *
     * `eligible` is the honest middle and the reason it exists: the creator has
     * earned the programme and the platform has not opened it. Calling that
     * "locked" would blame the creator for the operator's decision.
     */
    public function status(string $mode, bool $allMet): string
    {
        return match (true) {
            $mode === 'disabled'    => self::DISABLED,
            $mode === 'coming_soon' => $allMet ? self::ELIGIBLE : self::COMING_SOON,
            $allMet                 => self::ACTIVE,
            default                 => self::LOCKED,
        };
    }

    /** Every programme this surface may render, measured for this creator. */
    public function evaluateAll(User $user, string $surface = 'app', ?string $country = null): Collection
    {
        $metrics = $this->metrics($user);

        return MonetizationProgram::visibleOnSurface($surface)
            ->map(fn (MonetizationProgram $p) => $this->evaluateProgram($p, $metrics, $user->id, $country))
            ->values();
    }

    /**
     * Recompute and persist this creator's state for every programme.
     *
     * Returns the transitions - programmes that just unlocked or just lost
     * access - so a caller can notify on them. Runs against EVERY programme,
     * including hidden ones, because a creator's progress toward something not
     * yet launched is still worth recording.
     */
    public function sync(User $user): array
    {
        $metrics = $this->metrics($user);
        $now = now();
        $transitions = ['unlocked' => [], 'suspended' => []];

        foreach (MonetizationProgram::allCached() as $program) {
            $eval = $this->evaluateProgram($program, $metrics, $user->id);

            $row = CreatorProgramStatus::firstOrNew([
                'user_id'     => $user->id,
                'program_key' => $program->key,
            ]);

            $wasActive = $row->exists && $row->status === self::ACTIVE;
            $isActive  = $eval['status'] === self::ACTIVE;

            // Timestamps are set once and kept: `unlocked_at` is the first time
            // this creator ever had the programme, which is the question anyone
            // reading this table later actually asks.
            if ($isActive && ! $wasActive) {
                $row->unlocked_at ??= $now;
                $row->suspended_at = null;
                $transitions['unlocked'][] = $program->key;
            }
            if ($wasActive && ! $isActive) {
                $row->suspended_at = $now;
                $transitions['suspended'][] = $program->key;
            }

            $row->fill([
                'status'       => $eval['status'],
                'met_count'    => $eval['met_count'],
                'total_count'  => $eval['total_count'],
                'percent'      => $eval['percent'],
                'evaluated_at' => $now,
            ])->save();
        }

        return $transitions;
    }

    /**
     * Cheap check for the rest of the backend: may this creator use this
     * programme right now?
     *
     * Measured rather than read from the snapshot, because a caller asking this
     * is usually about to move money - and a stale row is not good enough for
     * that. The snapshot is for history and for lists, not for authorisation.
     *
     * First real caller: GiftController::send() - a gift used to credit ANY
     * existing receiver regardless of whether they had ever unlocked Gifts &
     * Coins. Country is resolved the same way every other caller of
     * evaluateProgram() resolves it (an unconfigured programme allows every
     * country regardless, so this was harmless while `gifts` had no region
     * list - but silently wrong the moment one is ever added, since a missing
     * country reads as "region not allowed").
     */
    public function canUse(User $user, string $programKey): bool
    {
        $program = MonetizationProgram::allCached()->firstWhere('key', $programKey);
        if (! $program) return false;

        $country = $user->selected_country_code ?: $user->detected_country_code ?: $user->country;
        $eval = $this->evaluateProgram($program, $this->metrics($user), $user->id, $country);

        if ($eval['status'] !== self::ACTIVE) return false;

        /*
         * account_standing is the admin's blanket monetization pause/ban
         * (AdminUser360Controller's pause/ban/reset/enable actions), separate
         * from every per-programme requirement above - a creator can meet
         * every Gifts requirement and still be suspended. Checked as
         * "explicitly false", not "row is true": the column defaults to
         * false at the DB level and firstOrCreate() elsewhere only pins
         * account_standing (not the other flags) on a first touch, so a row
         * that exists only because an admin merely opened this creator's
         * monetization tab must NOT read as suspended - only a real
         * pause/ban action (which always sets this column explicitly)
         * should. live_gifts_enabled/subscriptions_enabled are NOT checked
         * here for the same reason: they default to false at the DB level
         * with no explicit override on first touch, so unlike
         * account_standing they cannot currently be trusted as a signal -
         * that's a pre-existing gap in the admin toggle itself, not
         * something to paper over by gating on it here.
         */
        $standing = CreatorMonetizationStatus::where('user_id', $user->id)->value('account_standing');

        return $standing !== false;
    }

    /**
     * Same question as canUse(), cached for a few minutes - for surfaces that
     * only decide whether to SHOW a gift-sending affordance on someone else's
     * content (comments, LIVE), not for anything that actually moves money.
     * A gift icon can tolerate a few minutes of staleness; the send itself
     * cannot, so GiftController::send() still calls canUse() directly, live,
     * uncached, at the moment coins would actually change hands - the icon
     * and the enforcement can therefore disagree for at most this TTL, and
     * only in the safe direction (icon shown, send correctly refused), never
     * the other way.
     */
    public function canUseCached(int $userId, string $programKey): bool
    {
        return \Illuminate\Support\Facades\Cache::remember(
            "monetization_can_use:{$programKey}:{$userId}",
            300,
            function () use ($userId, $programKey) {
                $user = User::find($userId);
                return $user ? $this->canUse($user, $programKey) : false;
            },
        );
    }
}
