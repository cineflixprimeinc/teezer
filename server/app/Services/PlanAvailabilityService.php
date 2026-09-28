<?php

namespace App\Services;

use App\Models\SubscriptionPlan;
use App\Models\User;
use Carbon\Carbon;

/**
 * The one place that decides whether a plan is available.
 *
 * Website, app, and anything built later all reach this through the same
 * endpoint, so none of them implements the rules itself. That is the whole
 * point: a plan hidden in one surface and purchasable in another is not a UI
 * bug, it is two implementations of the same policy disagreeing, and the only
 * durable fix is for there to be one implementation.
 *
 * Two questions, deliberately separate:
 *
 *   visible(...)     - should this plan be SHOWN in this placement at all
 *   purchasable(...) - may THIS caller buy it right now, and if not, why
 *
 * They are not the same. A plan can be visible and unbuyable (wrong country,
 * account too new, sold out of its window), which should render as a disabled
 * card with a reason rather than vanish - a plan that silently disappears reads
 * as a bug to the user and generates support tickets. Only `hidden` and the
 * archived/disabled states remove it from the list entirely.
 *
 * Every check fails OPEN on missing configuration: a plan with no platforms
 * set, no countries set and no schedule is available everywhere, to everyone,
 * forever. That is what makes the columns additive - existing plans keep
 * behaving exactly as they did before the settings existed.
 */
class PlanAvailabilityService
{
    /** Surfaces a plan can be sold on. Adding one needs no migration. */
    public const PLATFORMS = ['web', 'android', 'ios', 'mobile_web', 'pwa', 'desktop_app'];

    /** Lifecycle. Ordered from most to least available. */
    public const STATUSES = ['active', 'temporarily_unavailable', 'disabled', 'archived'];

    /** Placements a plan can be shown in. */
    public const VISIBILITY_KEYS = [
        'premium_page', 'upgrade_modal_app', 'upgrade_modal_web', 'profile_upgrade',
        'in_app_prompts', 'web_prompts', 'search_discovery', 'hidden',
    ];

    public const ELIGIBILITY = [
        'everyone', 'new_users', 'existing_users', 'free_users', 'without_active_subscription', 'user_groups',
    ];

    public const COUNTRY_MODES = ['all', 'include', 'exclude'];

    public const SUBSCRIBER_BEHAVIOURS = [
        'keep_and_renew', 'keep_no_renew', 'cancel_renewals', 'revoke_immediately',
    ];

    /**
     * Should this plan appear at all, for this placement and platform?
     *
     * @param  array{platform?:?string,placement?:?string}  $ctx
     */
    public function visible(SubscriptionPlan $plan, array $ctx = []): bool
    {
        // Archived and disabled are gone from every customer-facing surface.
        // temporarily_unavailable deliberately is NOT - the whole reason it is a
        // separate state is that the plan keeps its place and explains itself.
        if (in_array($plan->status, ['archived', 'disabled'], true)) {
            return false;
        }

        $vis = $this->visibilityFlags($plan);

        if (! empty($vis['hidden'])) {
            return false;
        }

        if (! $this->platformAllowed($plan, $ctx['platform'] ?? null)) {
            return false;
        }

        // An unknown placement is shown rather than hidden: a surface built
        // later must not silently disappear because this list predates it.
        $placement = $ctx['placement'] ?? null;
        if ($placement !== null && array_key_exists($placement, $vis)) {
            return (bool) $vis[$placement];
        }

        return true;
    }

    /**
     * May this caller buy it right now?
     *
     * @param  array{platform?:?string,country?:?string}  $ctx
     * @return array{ok:bool,reason:?string,message:?string}
     */
    public function purchasable(SubscriptionPlan $plan, ?User $user, array $ctx = []): array
    {
        if ($plan->status !== 'active') {
            return $this->no('status', match ($plan->status) {
                'temporarily_unavailable' => 'This plan is temporarily unavailable.',
                'archived'                => 'This plan is no longer offered.',
                default                   => 'This plan is not available for purchase.',
            });
        }

        if (! $this->platformAllowed($plan, $ctx['platform'] ?? null)) {
            return $this->no('platform', 'This plan cannot be purchased on this device.');
        }

        if (! $this->withinSchedule($plan)) {
            return $this->no('schedule', 'This plan is not available at this time.');
        }

        if (! $this->countryAllowed($plan, $ctx['country'] ?? null)) {
            return $this->no('country', 'This plan is not available in your country.');
        }

        // Everything past here is about the buyer, so an anonymous caller is
        // told to sign in rather than being refused outright - the plan is fine,
        // we just cannot evaluate them yet.
        if ($user === null) {
            return $this->needsAccount($plan);
        }

        if (($fail = $this->eligibilityFailure($plan, $user)) !== null) {
            return $fail;
        }

        return $this->requirementFailure($plan, $user) ?? ['ok' => true, 'reason' => null, 'message' => null];
    }

    /* ── individual rules ───────────────────────────────────────────────── */

    public function platformAllowed(SubscriptionPlan $plan, ?string $platform): bool
    {
        $allowed = $plan->platforms;

        // Unset means every platform. Only an explicit list restricts.
        if (! is_array($allowed) || $allowed === []) {
            return true;
        }
        // An unknown/absent platform is allowed: a client that does not report
        // one must not be locked out of buying.
        if ($platform === null || ! in_array($platform, self::PLATFORMS, true)) {
            return true;
        }

        return in_array($platform, $allowed, true);
    }

    public function withinSchedule(SubscriptionPlan $plan): bool
    {
        $now = Carbon::now();

        if ($plan->available_from && $now->lt($plan->available_from)) {
            return false;
        }
        if ($plan->available_until && $now->gt($plan->available_until)) {
            return false;
        }

        return true;
    }

    public function countryAllowed(SubscriptionPlan $plan, ?string $country): bool
    {
        $mode = $plan->countries_mode ?: 'all';
        if ($mode === 'all') {
            return true;
        }

        $list = array_map('strtoupper', is_array($plan->countries) ? $plan->countries : []);
        $code = $country ? strtoupper($country) : null;

        // Unknown country: allowed under `exclude` (we cannot prove they are on
        // the block list) and refused under `include` (we cannot prove they are
        // on the allow list). Failing the safer way round in each direction.
        if ($code === null) {
            return $mode === 'exclude';
        }

        return $mode === 'include'
            ? in_array($code, $list, true)
            : ! in_array($code, $list, true);
    }

    /* ── buyer rules ────────────────────────────────────────────────────── */

    /** @return array{ok:bool,reason:?string,message:?string}|null */
    private function eligibilityFailure(SubscriptionPlan $plan, User $user): ?array
    {
        $rule = $plan->purchase_eligibility ?: 'everyone';
        if ($rule === 'everyone') {
            return null;
        }

        // Declared in the admin UI as "Coming Soon" and enforced as a no-op
        // rather than as a refusal: there is no user-group table, so treating it
        // as a restriction would silently make the plan unbuyable.
        if ($rule === 'user_groups') {
            return null;
        }

        $hasActive = $this->hasActiveSubscription($user);
        $everSubscribed = \App\Models\Subscription::where('user_id', $user->id)->exists();

        return match ($rule) {
            'new_users' => $everSubscribed
                ? $this->no('eligibility', 'This plan is only available to new users.')
                : null,
            'existing_users' => $everSubscribed
                ? null
                : $this->no('eligibility', 'This plan is only available to existing subscribers.'),
            'free_users' => $hasActive
                ? $this->no('eligibility', 'This plan is only available to users without a subscription.')
                : null,
            'without_active_subscription' => $hasActive
                ? $this->no('eligibility', 'Your current subscription must expire or be cancelled first.')
                : null,
            default => null,
        };
    }

    /** @return array{ok:bool,reason:?string,message:?string}|null */
    private function requirementFailure(SubscriptionPlan $plan, User $user): ?array
    {
        $r = is_array($plan->requirements) ? $plan->requirements : [];

        if (! empty($r['verified_email']) && ! $user->email_verified_at) {
            return $this->no('verified_email', 'Verify your email address to buy this plan.');
        }

        // Guarded on the column existing: phone verification is not present on
        // every deployment of this schema, and a missing column must not become
        // "nobody can buy anything".
        if (! empty($r['verified_phone'])
            && \Illuminate\Support\Facades\Schema::hasColumn('users', 'phone_verified_at')
            && ! $user->phone_verified_at) {
            return $this->no('verified_phone', 'Verify your phone number to buy this plan.');
        }

        if (! empty($r['min_account_age_days'])) {
            $days = (int) $r['min_account_age_days'];
            if ($days > 0 && $user->created_at && $user->created_at->diffInDays(Carbon::now()) < $days) {
                return $this->no('account_age', "Your account must be at least {$days} days old.");
            }
        }

        if (! empty($r['min_user_age_years'])) {
            $years = (int) $r['min_user_age_years'];
            $dob = $user->date_of_birth ?? null;
            // Unknown date of birth is NOT a refusal - it is unmeasurable, and
            // refusing would lock out every account that predates the field.
            if ($years > 0 && $dob && Carbon::parse($dob)->diffInYears(Carbon::now()) < $years) {
                return $this->no('user_age', "You must be at least {$years} years old.");
            }
        }

        if (! empty($r['creator_account']) && ! ($user->is_creator ?? false)) {
            return $this->no('creator_account', 'This plan is for creator accounts.');
        }

        if (! empty($r['business_account']) && ! ($user->is_business ?? false)) {
            return $this->no('business_account', 'This plan is for business accounts.');
        }

        return null;
    }

    private function hasActiveSubscription(User $user): bool
    {
        return \App\Models\Subscription::where('user_id', $user->id)
            ->where('status', 'active')
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', Carbon::now()))
            ->exists();
    }

    /* ── shapes ─────────────────────────────────────────────────────────── */

    /** @return array<string,bool> */
    public function visibilityFlags(SubscriptionPlan $plan): array
    {
        $stored = is_array($plan->visibility) ? $plan->visibility : [];
        $out = [];
        foreach (self::VISIBILITY_KEYS as $k) {
            // Default ON for placements and OFF for `hidden`, so an unset
            // document means "shown normally" rather than "shown nowhere".
            $out[$k] = array_key_exists($k, $stored) ? (bool) $stored[$k] : ($k !== 'hidden');
        }

        return $out;
    }

    /** @return array{ok:false,reason:string,message:string} */
    private function no(string $reason, string $message): array
    {
        return ['ok' => false, 'reason' => $reason, 'message' => $message];
    }

    /** @return array{ok:bool,reason:?string,message:?string} */
    private function needsAccount(SubscriptionPlan $plan): array
    {
        $restricted = ($plan->purchase_eligibility ?: 'everyone') !== 'everyone'
            || ! empty($plan->requirements);

        return $restricted
            ? $this->no('sign_in_required', 'Sign in to check whether you can buy this plan.')
            : ['ok' => true, 'reason' => null, 'message' => null];
    }
}
