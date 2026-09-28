<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\ShopCoupon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Admin CRUD over Shop marketplace coupons. Mirrors
 * AdminCouponController's shape (the platform-wide/subscription coupon
 * admin screen) closely, on purpose, but against ShopCoupon/shop_coupons -
 * see that model's own doc comment for why this is a separate system.
 */
class AdminShopCouponController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => ShopCoupon::orderByDesc('id')->get(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request, null);
        $coupon = ShopCoupon::create($data);

        return response()->json(['success' => true, 'data' => $coupon], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $coupon = ShopCoupon::find($id);
        if (!$coupon) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }

        $coupon->update($this->validated($request, $id));

        return response()->json(['success' => true, 'data' => $coupon]);
    }

    public function destroy(int $id): JsonResponse
    {
        $coupon = ShopCoupon::find($id);
        if (!$coupon) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }

        // Same reasoning as the platform coupon system: once claimed, the
        // claim rows are a record of what a real user was promised -
        // deactivate rather than delete so that record survives.
        if ($coupon->claims()->exists()) {
            $coupon->update(['is_active' => false]);

            return response()->json([
                'success' => true,
                'message' => 'This coupon has been claimed, so it was deactivated rather than deleted.',
            ]);
        }

        $coupon->delete();

        return response()->json(['success' => true, 'message' => 'Coupon deleted.']);
    }

    private function validated(Request $request, ?int $ignoreId): array
    {
        $rules = [
            'code' => [
                $ignoreId ? 'sometimes' : 'required', 'string', 'min:4', 'max:32', 'alpha_num',
                Rule::unique('shop_coupons', 'code')->ignore($ignoreId),
            ],
            'title'          => [$ignoreId ? 'sometimes' : 'required', 'string', 'max:80'],
            'description'    => ['nullable', 'string', 'max:255'],
            'type'           => [$ignoreId ? 'sometimes' : 'required', Rule::in(ShopCoupon::TYPES)],
            'value'          => ['nullable', 'numeric', 'min:0'],
            'min_spend'      => ['nullable', 'numeric', 'min:0'],
            'usage_limit'    => ['nullable', 'integer', 'min:1'],
            'is_active'      => ['sometimes', 'boolean'],
            'starts_at'      => ['nullable', 'date'],
            'ends_at'        => ['nullable', 'date', 'after_or_equal:starts_at'],
            'sort_order'     => ['sometimes', 'integer', 'min:0'],
        ];

        $d = $request->validate($rules);

        if (isset($d['code'])) {
            $d['code'] = strtoupper($d['code']);
        }
        // free_delivery has no discount amount - dropping value here rather
        // than in the client keeps the constraint enforced no matter what a
        // stale form submits.
        if (($d['type'] ?? null) === ShopCoupon::TYPE_FREE_DELIVERY) {
            $d['value'] = null;
        } elseif (($d['type'] ?? null) === ShopCoupon::TYPE_PERCENTAGE) {
            $d['value'] = min(100, (float) ($d['value'] ?? 0));
        }

        return $d;
    }
}
