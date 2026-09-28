<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Services\CouponService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Monetization → Coupons & Offers.
 *
 * Admin CRUD over the coupon definitions the checkout validates against. All
 * validation and status derivation lives in CouponService so this controller
 * and the customer-facing path cannot disagree about what "expired" means.
 */
class AdminCouponController extends Controller
{
    public function __construct(private readonly CouponService $coupons) {}

    public function index(Request $request): JsonResponse
    {
        $q = DB::table('coupons');

        if ($s = trim((string) $request->query('q', ''))) {
            $like = '%' . strtoupper($s) . '%';
            $q->where(function ($w) use ($like) {
                $w->whereRaw('UPPER(code) LIKE ?', [$like])
                  ->orWhereRaw('UPPER(name) LIKE ?', [$like]);
            });
        }
        if ($t = $request->query('type')) {
            $q->where('type', $t);
        }
        if ($plan = $request->query('plan')) {
            // JSON containment is engine-specific, so this filters in PHP after
            // the fetch rather than shipping a Postgres-only where clause into a
            // query the test database also has to run.
            $q->whereNotNull('applicable_plans');
        }

        $rows = $q->orderByDesc('id')->get()
            ->map(fn ($c) => $this->coupons->shape($c));

        // Status is derived, not stored, so it is filtered here rather than in
        // SQL - one definition of the word, in CouponService.
        if ($status = $request->query('status')) {
            $rows = $rows->filter(fn ($c) => $c['status'] === $status);
        }
        if ($plan) {
            $rows = $rows->filter(fn ($c) => in_array($plan, $c['applicable_plans'], true));
        }

        return response()->json([
            'success' => true,
            'data' => ['coupons' => $rows->values(), 'stats' => $this->coupons->stats()],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request, null);

        $id = DB::table('coupons')->insertGetId(array_merge($data, [
            'used_count' => 0, 'created_at' => now(), 'updated_at' => now(),
        ]));

        return response()->json([
            'success' => true,
            'data' => $this->coupons->shape(DB::table('coupons')->find($id)),
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $existing = DB::table('coupons')->find($id);
        if (! $existing) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }

        $data = $this->validated($request, $id);
        DB::table('coupons')->where('id', $id)->update(array_merge($data, ['updated_at' => now()]));

        return response()->json([
            'success' => true,
            'data' => $this->coupons->shape(DB::table('coupons')->find($id)),
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        $redeemed = DB::table('coupon_redemptions')->where('coupon_id', $id)->exists();

        // Deactivate rather than delete once it has been used: the redemption
        // rows are a financial record of discounts actually given, and the FK
        // cascade would take them with it.
        if ($redeemed) {
            DB::table('coupons')->where('id', $id)->update(['is_active' => false, 'updated_at' => now()]);

            return response()->json([
                'success' => true,
                'message' => 'This coupon has been redeemed, so it was deactivated rather than deleted.',
            ]);
        }

        DB::table('coupons')->where('id', $id)->delete();

        return response()->json(['success' => true, 'message' => 'Coupon deleted.']);
    }

    /** CSV of every coupon, for the Export button. */
    public function export(): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        $rows = DB::table('coupons')->orderBy('id')->get();

        return response()->streamDownload(function () use ($rows) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Code', 'Name', 'Type', 'Value', 'Currency', 'Plans', 'Used', 'Limit', 'Valid until', 'Status']);
            foreach ($rows as $c) {
                $s = $this->coupons->shape($c);
                fputcsv($out, [
                    $s['code'], $s['name'], $s['type'], $s['value'], $s['currency'],
                    implode('|', $s['applicable_plans']) ?: 'all',
                    $s['used_count'], $s['usage_limit'] ?? 'unlimited',
                    $s['valid_until'] ?? 'no expiry', $s['status'],
                ]);
            }
            fclose($out);
        }, 'coupons.csv', ['Content-Type' => 'text/csv']);
    }

    /** @return array<string,mixed> */
    private function validated(Request $request, ?int $ignoreId): array
    {
        $rules = [
            'code' => [
                $ignoreId ? 'sometimes' : 'required', 'string', 'min:4', 'max:32', 'alpha_num',
                Rule::unique('coupons', 'code')->ignore($ignoreId),
            ],
            'name' => [$ignoreId ? 'sometimes' : 'required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:255'],
            'type' => [$ignoreId ? 'sometimes' : 'required', Rule::in(CouponService::TYPES)],
            'value' => [$ignoreId ? 'sometimes' : 'required', 'numeric', 'min:0'],
            'currency' => ['nullable', 'string', 'size:3'],
            'applicable_plans' => ['nullable', 'array'],
            'applicable_plans.*' => ['string', 'max:64'],
            'usage_limit' => ['nullable', 'integer', 'min:1'],
            'per_user_limit' => ['nullable', 'integer', 'min:1'],
            'min_amount' => ['nullable', 'numeric', 'min:0'],
            'valid_from' => ['nullable', 'date'],
            'valid_until' => ['nullable', 'date', 'after_or_equal:valid_from'],
            'is_active' => ['nullable', 'boolean'],
        ];

        $d = $request->validate($rules);

        if (isset($d['code'])) {
            // Stored uppercase so lookup never depends on collation.
            $d['code'] = strtoupper($d['code']);
        }
        if (array_key_exists('applicable_plans', $d)) {
            // Empty list means "all plans", which is null - keeping [] would
            // read as "applies to no plan" and silently break every checkout.
            $d['applicable_plans'] = $d['applicable_plans'] ? json_encode($d['applicable_plans']) : null;
        }
        if (($d['type'] ?? null) === 'percentage') {
            // A percentage has no currency; leaving one behind would imply the
            // discount was denominated.
            $d['currency'] = null;
            $d['value'] = min(100, (float) ($d['value'] ?? 0));
        }

        return $d;
    }
}
