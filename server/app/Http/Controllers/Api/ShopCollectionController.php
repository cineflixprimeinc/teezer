<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProductCollection;
use App\Models\Shop;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Seller-facing CRUD for a shop's product collections (Shop Settings >
 * Products > Collections). ProductCollection has existed since
 * 2026_08_18_000002 and is already read publicly via
 * ShopController::collections(), but until now the only thing that ever
 * wrote one was the demo seeder - there was no create/edit/delete path for
 * a real seller anywhere in the app.
 */
class ShopCollectionController extends Controller
{
    public function __construct(private readonly StorageService $storage)
    {
    }

    private function ownShop(Request $request): Shop
    {
        return Shop::where('user_id', $request->user()->id)->firstOrFail();
    }

    /** GET /shop/collections - the seller's own collections (same shape as the public read, seller-scoped, no pagination - a shop has few enough of these to not need it, same assumption ShopController::collections() already makes). */
    public function index(Request $request): JsonResponse
    {
        $shop = $this->ownShop($request);

        $collections = $shop->collections()->withCount('products')->orderBy('sort_order')->get();

        return response()->json([
            'success' => true,
            'data' => $collections->map(fn (ProductCollection $c) => $this->toArray($c))->values(),
        ]);
    }

    /** POST /shop/collections */
    public function store(Request $request): JsonResponse
    {
        $shop = $this->ownShop($request);

        $data = $request->validate([
            'name'       => ['required', 'string', 'max:80'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
            'cover'      => ['nullable', 'file', 'image', 'max:5120'],
        ]);

        $coverUrl = null;
        if ($request->hasFile('cover')) {
            $key = $this->storage->storeImage($request->file('cover'), 'collections');
            $coverUrl = $this->storage->url($key);
        }

        $collection = ProductCollection::create([
            'shop_id'         => $shop->id,
            'name'            => $data['name'],
            'sort_order'      => $data['sort_order'] ?? 0,
            'cover_image_url' => $coverUrl,
        ]);

        return response()->json(['success' => true, 'data' => $this->toArray($collection)], 201);
    }

    /**
     * PUT /shop/collections/{id} - name/sort_order only. Deliberately no
     * cover-image replacement here: PHP does not reliably parse a multipart
     * body on a PUT request (every file upload elsewhere in this codebase -
     * e.g. ShopSettingsController::uploadLogo - is its own dedicated POST
     * endpoint for exactly this reason), so mixing a file into this JSON
     * PUT would silently fail in practice rather than actually work.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $shop = $this->ownShop($request);
        $collection = ProductCollection::where('id', $id)->where('shop_id', $shop->id)->firstOrFail();

        $data = $request->validate([
            'name'       => ['sometimes', 'string', 'max:80'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
        ]);

        if ($data) {
            $collection->update($data);
        }

        return response()->json(['success' => true, 'data' => $this->toArray($collection->fresh())]);
    }

    /**
     * DELETE /shop/collections/{id} - deletes the collection row only.
     * Products in it are NOT deleted; Product.collection_id is nullable
     * (see the create_products_table migration), so they simply fall back
     * to uncategorised rather than disappearing.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $shop = $this->ownShop($request);
        $collection = ProductCollection::where('id', $id)->where('shop_id', $shop->id)->firstOrFail();

        $collection->products()->update(['collection_id' => null]);
        $collection->delete();

        return response()->json(['success' => true]);
    }

    private function toArray(ProductCollection $collection): array
    {
        return [
            'id'              => $collection->id,
            'name'            => $collection->name,
            'cover_image_url' => $collection->cover_image_url,
            'sort_order'      => $collection->sort_order,
            'products_count'  => (int) ($collection->products_count ?? $collection->products()->count()),
        ];
    }
}
