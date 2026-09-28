<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The one place a coupon is validated and redeemed.
 *
 * Same rule as the plan services: the website, the app and anything built later
 * all go through this, so none of them decides for itself whether a code is
 * good. A client that computes its own discount is a client that will
 * eventually charge a different number than the server records.
 *
 * ── Validate is not redeem ──────────────────────────────────────────────────
 *
 * `validate()` is a pure read - it tells the checkout screen what the code is
 * worth, and is safe to call on every keystroke. `redeem()` writes, is
 * transactional, and re-checks EVERYTHING validate did. That re-check is not
 * redundant: minutes can pass between a customer seeing "20% off" and paying,
 * and in that gap the coupon can expire or hit its limit. Trusting the earlier
 * validate would let a sold-out coupon through.
 *
 * ── Reasons, not booleans ───────────────────────────────────────────────────
 *
 * Every refusal carries a machine-readable `reason` and a human `message`, so
 * the client shows "this code expired" rather than a generic failure - and so
 * two surfaces cannot word the same refusal differently.
 */
class CouponService
{
    public const TYPES = ['percentage', 'fixed'];

    /**
     * Is this code usable by this person, for this plan, at this price?
     *
     * @return array{ok:bool,reason:?string,message:?string,coupon:?object,discount:float,final:float}
     */
    public function validate(string $code, ?User $user, ?string $planKey = null, float $amount = 0, ?string $currency = null): array
    {
        $code = strtoupper(trim($code));
        if ($code === '') {
            return $this->no('empty', 'Enter a coupon code.');
        }

        // Compared uppercase on both sides: the column is stored uppercase, so
        // this cannot depend on the database's collation being case-insensitive.
        $c = DB::table('coupons')->whereRaw('UPPER(code) = ?', [$code])->first();
        if (! $c) {
            return $this->no('not_found', 'That coupon code is not valid.');
        }
        if (! $c->is_active) {
            return $this->no('inactive', 'This coupon is no longer available.');
        }

        $now = Carbon::now();
        if ($c->valid_from && $now->lt(Carbon::parse($c->valid_from))) {
            return $this->no('not_started', 'This coupon is not active yet.');
        }
        if ($c->valid_until && $now->gt(Carbon::parse($c->valid_until))) {
            return $this->no('expired', 'This coupon has expired.');
        }

        // Null means unlimited. Checked before the per-user limit so a
        // sold-out coupon says so rather than blaming the customer.
        if ($c->usage_limit !== null && $c->used_count >= $c->usage_limit) {
            return $this->no('limit_reached', 'This coupon has been fully redeemed.');
        }

        $plans = $c->applicable_plans ? json_decode($c->applicable_plans, true) : null;
        if (is_array($plans) && $plans !== [] && $planKey !== null && ! in_array($planKey, $plans, true)) {
            return $this->no('wrong_plan', 'This coupon does not apply to the selected plan.');
        }

        if ($c->min_amount !== null && $amount > 0 && $amount < (float) $c->min_amount) {
            return $this->no('min_amount', 'Your order does not meet this coupon\'s minimum.');
        }

        if ($user && $c->per_user_limit !== null) {
            $mine = DB::table('coupon_redemptions')
                ->where('coupon_id', $c->id)->where('user_id', $user->id)->count();
            if ($mine >= $c->per_user_limit) {
                return $this->no('per_user', 'You have already used this coupon.');
            }
        }

        $discount = $this->discountFor($c, $amount, $currency);

        return [
            'ok' => true, 'reason' => null, 'message' => null,
            'coupon' => $this->shape($c),
            'discount' => $discount,
            'final' => max(0, round($amount - $discount, 2)),
        ];
    }

    /**
     * Record a redemption. Re-validates first - see the class note on why.
     *
     * @return array{ok:bool,reason:?string,message:?string,discount:float,final:float}
     */
    public function redeem(string $code, User $user, ?string $planKey, float $amount, ?string $currency): array
    {
        return DB::transaction(function () use ($code, $user, $planKey, $amount, $currency) {
            $check = $this->validate($code, $user, $planKey, $amount, $currency);
            if (! $check['ok']) {
                return $check;
            }

            // Re-read FOR UPDATE so two simultaneous checkouts cannot both pass
            // the limit check and both redeem the last one. The row lock is what
            // makes usage_limit actually a limit rather than a suggestion.
            $c = DB::table('coupons')->where('id', $check['coupon']['id'])->lockForUpdate()->first();
            if ($c->usage_limit !== null && $c->used_count >= $c->usage_limit) {
                return $this->no('limit_reached', 'This coupon has been fully redeemed.');
            }

            DB::table('coupon_redemptions')->insert([
                'coupon_id' => $c->id,
                'user_id' => $user->id,
                'plan_key' => $planKey,
                'amount_discounted' => $check['discount'],
                'currency' => $currency,
                'created_at' => now(),
            ]);

            // Same transaction as the row above, so the denormalised counter and
            // the events it summarises cannot drift.
            DB::table('coupons')->where('id', $c->id)->update([
                'used_count' => DB::raw('used_count + 1'),
                'updated_at' => now(),
            ]);

            return [
                'ok' => true, 'reason' => null, 'message' => null,
                'discount' => $check['discount'], 'final' => $check['final'],
            ];
        });
    }

    /**
     * What this coupon takes off `$amount`.
     *
     * A fixed-amount coupon in a DIFFERENT currency than the order is refused
     * rather than converted: converting would silently change the discount the
     * admin configured, and "₹50 off" quietly becoming "$0.60 off" is worse
     * than the coupon not applying.
     */
    public function discountFor(object $c, float $amount, ?string $currency = null): float
    {
        if ($amount <= 0) {
            return 0.0;
        }

        if ($c->type === 'fixed') {
            if ($c->currency && $currency && strtoupper($c->currency) !== strtoupper($currency)) {
                return 0.0;
            }
            // Never more than the order itself - a £50 coupon on a £4.99 plan
            // discounts £4.99, it does not owe the customer £45.
            return round(min((float) $c->value, $amount), 2);
        }

        return round($amount * ((float) $c->value / 100), 2);
    }

    /** Owner-facing totals for the admin header cards. Counted, never assumed. */
    public function stats(): array
    {
        $now = Carbon::now();

        return [
            'total' => (int) DB::table('coupons')->count(),
            'active' => (int) DB::table('coupons')
                ->where('is_active', true)
                ->where(fn ($q) => $q->whereNull('valid_until')->orWhere('valid_until', '>', $now))
                ->count(),
            'redemptions' => (int) DB::table('coupon_redemptions')->count(),
            // Summed from what was actually taken off, not recomputed from the
            // coupon values - prices and rates move.
            'total_discount' => round((float) DB::table('coupon_redemptions')->sum('amount_discounted'), 2),
        ];
    }

    /** Rebuild used_count from the redemption events. Self-healing. */
    public function recount(): int
    {
        $rows = DB::table('coupon_redemptions')
            ->select('coupon_id', DB::raw('COUNT(*) AS n'))
            ->groupBy('coupon_id')->pluck('n', 'coupon_id');

        $fixed = 0;
        foreach (DB::table('coupons')->get(['id', 'used_count']) as $c) {
            $real = (int) ($rows[$c->id] ?? 0);
            if ((int) $c->used_count !== $real) {
                DB::table('coupons')->where('id', $c->id)->update(['used_count' => $real]);
                $fixed++;
            }
        }

        return $fixed;
    }

    /** @return array<string,mixed> */
    public function shape(object $c): array
    {
        $plans = $c->applicable_plans ? json_decode($c->applicable_plans, true) : null;

        return [
            'id' => (int) $c->id,
            'code' => $c->code,
            'name' => $c->name,
            'description' => $c->description ?? null,
            'type' => $c->type,
            'value' => (float) $c->value,
            'currency' => $c->currency,
            'applicable_plans' => is_array($plans) ? $plans : [],
            'usage_limit' => $c->usage_limit !== null ? (int) $c->usage_limit : null,
            'per_user_limit' => $c->per_user_limit !== null ? (int) $c->per_user_limit : null,
            'used_count' => (int) $c->used_count,
            'min_amount' => $c->min_amount !== null ? (float) $c->min_amount : null,
            'valid_from' => $c->valid_from,
            'valid_until' => $c->valid_until,
            'is_active' => (bool) $c->is_active,
            // Derived, so the admin list and the customer see the same word for
            // the same state rather than each deciding what "expired" means.
            'status' => $this->statusOf($c),
            'created_at' => $c->created_at ?? null,
        ];
    }

    private function statusOf(object $c): string
    {
        if (! $c->is_active) {
            return 'inactive';
        }
        if ($c->valid_until && Carbon::now()->gt(Carbon::parse($c->valid_until))) {
            return 'expired';
        }
        if ($c->usage_limit !== null && $c->used_count >= $c->usage_limit) {
            return 'exhausted';
        }

        return 'active';
    }

    /** @return array{ok:false,reason:string,message:string,coupon:null,discount:float,final:float} */
    private function no(string $reason, string $message): array
    {
        return ['ok' => false, 'reason' => $reason, 'message' => $message, 'coupon' => null, 'discount' => 0.0, 'final' => 0.0];
    }
}
