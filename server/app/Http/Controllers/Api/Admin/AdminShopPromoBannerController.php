<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\ShopPromoBanner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Admin CRUD over the Shop marketplace home's promo carousel - see
 * ShopPromoBanner's own doc comment. Same shape as
 * AdminShopController::categories()/storeCategory()/updateCategory() (this
 * project's own "content curation CRUD" template), split into its own
 * controller since it's a distinct resource, not a Shop-taxonomy concern.
 */
class AdminShopPromoBannerController extends Controller
{
    private string $disk;

    public function __construct()
    {
        $this->disk = config('filesystems.default', 'local');
    }

    public function index(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => ShopPromoBanner::orderBy('sort_order')->orderBy('id')->get()
                ->map(fn (ShopPromoBanner $b) => $b->toClientArray() + [
                    'is_active'  => (bool) $b->is_active,
                    'starts_at'  => $b->starts_at?->toIso8601String(),
                    'ends_at'    => $b->ends_at?->toIso8601String(),
                    'sort_order' => $b->sort_order,
                ])->values(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $data['image_url'] = $this->maybeStoreImage($request) ?? null;

        $banner = ShopPromoBanner::create($data);

        return response()->json(['success' => true, 'data' => $banner], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $banner = ShopPromoBanner::find($id);
        if (!$banner) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }

        $data = $this->validated($request);
        $newImage = $this->maybeStoreImage($request);
        if ($newImage) {
            $this->deleteImage($banner->image_url);
            $data['image_url'] = $newImage;
        }

        $banner->update($data);

        return response()->json(['success' => true, 'data' => $banner]);
    }

    public function destroy(int $id): JsonResponse
    {
        $banner = ShopPromoBanner::find($id);
        if (!$banner) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }

        $this->deleteImage($banner->image_url);
        $banner->delete();

        return response()->json(['success' => true]);
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'title'          => 'required|string|max:80',
            'subtitle'       => 'nullable|string|max:160',
            'description'    => 'nullable|string|max:255',
            'gradient_start' => 'nullable|string|max:9',
            'gradient_end'   => 'nullable|string|max:9',
            'cta_label'      => 'sometimes|string|max:40',
            'cta_link'       => 'nullable|url|max:500',
            'is_active'      => 'sometimes|boolean',
            'sort_order'     => 'sometimes|integer|min:0',
            'starts_at'      => 'nullable|date',
            'ends_at'        => 'nullable|date|after_or_equal:starts_at',
        ]);
    }

    /** Optional - a banner can be pure gradient + copy, so no image is a
     *  perfectly valid submission, not an error. */
    private function maybeStoreImage(Request $request): ?string
    {
        if (!$request->hasFile('image_file')) {
            return null;
        }
        $request->validate(['image_file' => 'image|mimes:jpg,jpeg,png,webp|max:5120']);

        return $request->file('image_file')->store('shop/promo-banners', $this->disk);
    }

    private function deleteImage(?string $path): void
    {
        if (!$path || !Str::startsWith($path, 'shop/promo-banners/')) {
            return;
        }
        try {
            Storage::disk($this->disk)->delete($path);
        } catch (\Throwable) {
            // A missing file is not worth failing the request over.
        }
    }
}
