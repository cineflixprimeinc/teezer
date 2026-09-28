<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ShopDeal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/**
 * Admin CRUD over "Deals of the day" - see ShopDeal's own doc comment for
 * why this points at a real, existing Product instead of inventing one.
 * searchProducts() is the one genuinely new capability this needs: an
 * admin-only, cross-shop product lookup - everywhere else in the app,
 * product access stays scoped to one shop at a time (ShopController never
 * offers this, on purpose).
 */
class AdminShopDealController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => ShopDeal::with('product:id,shop_id,name,image_url,price,currency')
                ->orderBy('sort_order')->orderBy('id')->get()
                ->map(fn (ShopDeal $d) => $this->shape($d))
                ->values(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $deal = ShopDeal::create($data);
        $deal->load('product:id,shop_id,name,image_url,price,currency');

        return response()->json(['success' => true, 'data' => $this->shape($deal)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $deal = ShopDeal::find($id);
        if (!$deal) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }

        $deal->update($this->validated($request));
        $deal->load('product:id,shop_id,name,image_url,price,currency');

        return response()->json(['success' => true, 'data' => $this->shape($deal)]);
    }

    public function destroy(int $id): JsonResponse
    {
        $deal = ShopDeal::find($id);
        if (!$deal) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }
        $deal->delete();

        return response()->json(['success' => true]);
    }

    /** GET /admin/shop/products/search?q= - name/id, across every shop. */
    public function searchProducts(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        $products = Product::with('shop:id,shop_name')
            ->where('is_active', true)
            ->when($q !== '', fn ($query) => $query->where(fn ($w) => $w
                ->where('name', 'like', "%{$q}%")
                ->orWhere('id', $q)))
            ->orderByDesc('id')
            ->limit(20)
            ->get();

        return response()->json([
            'success' => true,
            'data' => $products->map(fn (Product $p) => [
                'id'        => $p->id,
                'name'      => $p->name,
                'image_url' => $p->image_url ? Storage::url($p->image_url) : null,
                'price'     => (float) $p->price,
                'currency'  => $p->currency,
                'shop_name' => $p->shop?->shop_name,
            ])->values(),
        ]);
    }

    private function validated(Request $request): array
    {
        $data = $request->validate([
            'product_id' => ['required', 'integer', Rule::exists('products', 'id')],
            'deal_price' => ['required', 'numeric', 'min:0'],
            'is_active'  => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
            'starts_at'  => ['nullable', 'date'],
            'ends_at'    => ['nullable', 'date', 'after_or_equal:starts_at'],
        ]);

        // Derived, not client-supplied - the discount shown must always
        // match deal_price against the product's OWN current price, never
        // a number the admin form could get out of sync with it.
        $product = Product::findOrFail($data['product_id']);
        $original = (float) $product->price;
        $data['discount_percent'] = $original > 0
            ? max(0, min(99, (int) round((1 - ((float) $data['deal_price'] / $original)) * 100)))
            : 0;

        return $data;
    }

    private function shape(ShopDeal $deal): array
    {
        return [
            'id'               => $deal->id,
            'product_id'       => $deal->product_id,
            'product'          => $deal->product ? [
                'name'      => $deal->product->name,
                'image_url' => $deal->product->image_url ? Storage::url($deal->product->image_url) : null,
                'price'     => (float) $deal->product->price,
                'currency'  => $deal->product->currency,
                'shop_name' => $deal->product->shop?->shop_name,
            ] : null,
            'deal_price'       => (float) $deal->deal_price,
            'discount_percent' => $deal->discount_percent,
            'is_active'        => (bool) $deal->is_active,
            'sort_order'       => $deal->sort_order,
            'starts_at'        => $deal->starts_at?->toIso8601String(),
            'ends_at'          => $deal->ends_at?->toIso8601String(),
        ];
    }
}
