<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\CountrySellerRequirement;
use App\Models\SellerDocument;
use App\Models\Shop;
use App\Models\ShopCategory;
use App\Models\TaxForm;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * The "Reelsoo Shop" admin section - platform-wide product categories (the
 * storefront's [All] [Fashion] [Beauty]... carousel), a read-only view of
 * every shop on the platform, and (below) the "Sell on Reelsoo" seller
 * application review queue + the configurable per-country requirement rules
 * SellerApplicationController resolves against. Sellers still own their own
 * products/collections/reviews - there is no admin CRUD over those, only
 * over the category taxonomy every shop's grid filters against and the
 * application/approval lifecycle itself.
 */
class AdminShopController extends Controller
{
    /** All categories, including inactive ones - the admin needs to see what it has turned off. */
    public function categories(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => ShopCategory::orderBy('sort_order')->orderBy('id')->get(),
        ]);
    }

    public function storeCategory(Request $request): JsonResponse
    {
        $data = $this->validated($request, null);
        $data['slug'] = $data['slug'] ?? Str::slug($data['name']);

        $category = ShopCategory::create($data);

        return response()->json(['success' => true, 'data' => $category], 201);
    }

    public function updateCategory(Request $request, int $id): JsonResponse
    {
        $category = ShopCategory::find($id);
        if (!$category) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }

        $data = $this->validated($request, $id);
        $category->update($data);

        return response()->json(['success' => true, 'data' => $category]);
    }

    public function destroyCategory(int $id): JsonResponse
    {
        $category = ShopCategory::find($id);
        if (!$category) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }

        // Products keep their row (category_id nulls out via the FK's
        // nullOnDelete) - deleting a category should not delete products.
        $category->delete();

        return response()->json(['success' => true]);
    }

    /** Read-only: every shop on the platform, for moderation visibility. */
    public function shops(Request $request): JsonResponse
    {
        $q = Shop::query()->with('user:id,username,name');

        if ($s = trim((string) $request->query('q', ''))) {
            $q->where(function ($w) use ($s) {
                $w->where('shop_name', 'like', "%{$s}%")
                  ->orWhereHas('user', fn ($u) => $u->where('username', 'like', "%{$s}%"));
            });
        }

        $shops = $q->withCount(['products', 'collections'])
            ->orderByDesc('created_at')
            ->paginate($request->input('per_page', 20));

        return response()->json([
            'success' => true,
            'data' => collect($shops->items())->map(fn (Shop $s) => [
                'id'                => $s->id,
                'shop_name'         => $s->shop_name,
                'owner_username'    => $s->user?->username,
                'is_live'           => (bool) $s->is_live,
                'rating_avg'        => (float) $s->rating_avg,
                'rating_count'      => (int) $s->rating_count,
                'sold_count'        => (int) $s->sold_count,
                'products_count'    => (int) $s->products_count,
                'collections_count' => (int) $s->collections_count,
                'created_at'        => $s->created_at?->toIso8601String(),
            ])->values(),
            'meta' => [
                'current_page' => $shops->currentPage(),
                'last_page'    => $shops->lastPage(),
                'total'        => $shops->total(),
            ],
        ]);
    }

    private function validated(Request $request, ?int $ignoreId): array
    {
        return $request->validate([
            'name'       => 'required|string|max:60',
            'slug'       => ['sometimes', 'nullable', 'string', 'max:60', Rule::unique('shop_categories', 'slug')->ignore($ignoreId)],
            // A subcategory cannot be its own parent. Rule::notIn([null])
            // would wrongly reject a perfectly valid "no parent" - only
            // applied when editing (ignoreId set), never on create.
            'parent_id'  => [
                'sometimes', 'nullable', 'integer', 'exists:shop_categories,id',
                ...($ignoreId ? [Rule::notIn([$ignoreId])] : []),
            ],
            'is_active'  => 'sometimes|boolean',
            'sort_order' => 'sometimes|integer|min:0',
            // Shop marketplace home curation - see the migration that added these.
            'is_featured_home' => 'sometimes|boolean',
            'home_sort_order'  => 'sometimes|integer|min:0',
        ]);
    }

    /* ── Seller applications ("Sell on Reelsoo" review queue) ───────────────
     *
     * Every mutation below is the ONLY place shops.status can move to/from
     * APPROVED anywhere in the codebase - SellerApplicationController (the
     * seller-facing side) can only ever reach PENDING_REVIEW via submit().
     */

    public function applications(Request $request): JsonResponse
    {
        $q = Shop::query()->with('user:id,username,name')->whereNotNull('seller_type');

        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($country = $request->query('country_code')) {
            $q->where('country_code', strtoupper($country));
        }
        if ($sellerType = $request->query('seller_type')) {
            $q->where('seller_type', $sellerType);
        }
        if ($s = trim((string) $request->query('q', ''))) {
            $q->where(function ($w) use ($s) {
                $w->where('shop_name', 'like', "%{$s}%")
                  ->orWhere('shop_username', 'like', "%{$s}%")
                  ->orWhereHas('user', fn ($u) => $u->where('username', 'like', "%{$s}%"));
            });
        }

        $shops = $q->orderByDesc('updated_at')->paginate($request->input('per_page', 20));

        return response()->json([
            'success' => true,
            'data' => collect($shops->items())->map(fn (Shop $s) => [
                'id'             => $s->id,
                'shop_name'      => $s->shop_name,
                'shop_username'  => $s->shop_username,
                'owner_username' => $s->user?->username,
                'seller_type'    => $s->seller_type,
                'country_code'   => $s->country_code,
                'status'         => $s->status,
                'updated_at'     => $s->updated_at?->toIso8601String(),
            ])->values(),
            'meta' => [
                'current_page' => $shops->currentPage(),
                'last_page'    => $shops->lastPage(),
                'total'        => $shops->total(),
            ],
        ]);
    }

    /** Full review detail: shop + private seller_profile + documents (signed) + linked tax form status. */
    public function applicationShow(int $id): JsonResponse
    {
        $shop = Shop::with(['user:id,username,name,email', 'sellerProfile', 'documents', 'category'])->find($id);
        if (!$shop) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }

        $taxForm = TaxForm::where('user_id', $shop->user_id)->latest()->first();

        return response()->json(['success' => true, 'data' => [
            'id'             => $shop->id,
            'status'         => $shop->status,
            'seller_type'    => $shop->seller_type,
            'country_code'   => $shop->country_code,
            'shop_name'      => $shop->shop_name,
            'shop_username'  => $shop->shop_username,
            'description'    => $shop->tagline,
            'logo_url'       => $shop->logoUrl(),
            'category'       => $shop->category?->name,
            'policies'       => $shop->policies,
            'owner' => [
                'username' => $shop->user?->username,
                'name'     => $shop->user?->name,
                'email'    => $shop->user?->email,
            ],
            // Private - admin review only, never sent through ShopController.
            'legal_data'     => $shop->sellerProfile?->legal_data,
            'agreements'     => $shop->sellerProfile?->agreements,
            'admin_note'     => $shop->sellerProfile?->admin_note,
            'submitted_at'   => $shop->sellerProfile?->submitted_at?->toIso8601String(),
            'documents'      => $shop->documents->map(fn (SellerDocument $d) => [
                'id'           => $d->id,
                'document_key' => $d->document_key,
                'status'       => $d->status,
                'admin_note'   => $d->admin_note,
                // Signed, short-lived - the only way this ever leaves the server.
                'url'          => $d->signedUrl(),
                'uploaded_at'  => $d->created_at->toIso8601String(),
            ])->values(),
            'tax_form' => $taxForm ? [
                'status'     => $taxForm->status,
                'form_type'  => $taxForm->form_type,
                'entity_kind'=> $taxForm->entity_kind,
            ] : null,
        ]]);
    }

    /** One document's own approve/reject - independent of the overall application decision. */
    public function reviewDocument(Request $request, int $shopId, int $docId): JsonResponse
    {
        $data = $request->validate([
            'status'     => ['required', Rule::in([SellerDocument::STATUS_APPROVED, SellerDocument::STATUS_REJECTED])],
            'admin_note' => ['nullable', 'string', 'max:500'],
        ]);

        $doc = SellerDocument::where('shop_id', $shopId)->where('id', $docId)->first();
        if (!$doc) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }
        $doc->update($data);

        return response()->json(['success' => true, 'data' => $doc]);
    }

    public function approveApplication(int $id): JsonResponse
    {
        $shop = Shop::with('sellerProfile')->find($id);
        if (!$shop) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }

        $shop->update(['status' => Shop::STATUS_APPROVED]);
        $shop->sellerProfile?->update(['admin_note' => null]);

        return response()->json(['success' => true, 'data' => ['status' => $shop->status]]);
    }

    public function rejectApplication(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:1000']]);

        $shop = Shop::with('sellerProfile')->find($id);
        if (!$shop) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }

        $shop->update(['status' => Shop::STATUS_REJECTED]);
        $shop->sellerProfile?->update(['admin_note' => $data['reason']]);

        return response()->json(['success' => true, 'data' => ['status' => $shop->status]]);
    }

    /** "Needs information" - the seller can correct and resubmit rather than starting over. */
    public function requestApplicationInfo(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['note' => ['required', 'string', 'max:1000']]);

        $shop = Shop::with('sellerProfile')->find($id);
        if (!$shop) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }

        $shop->update(['status' => Shop::STATUS_NEEDS_INFORMATION]);
        $shop->sellerProfile?->update(['admin_note' => $data['note']]);

        return response()->json(['success' => true, 'data' => ['status' => $shop->status]]);
    }

    /** Suspends an already-approved shop - the public Shop tab/page disappear immediately (ShopController::approvedShop()). */
    public function suspendApplication(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['reason' => ['nullable', 'string', 'max:1000']]);

        $shop = Shop::with('sellerProfile')->find($id);
        if (!$shop) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }

        $shop->update(['status' => Shop::STATUS_SUSPENDED]);
        if (!empty($data['reason'])) {
            $shop->sellerProfile?->update(['admin_note' => $data['reason']]);
        }

        return response()->json(['success' => true, 'data' => ['status' => $shop->status]]);
    }

    /** Reinstates a suspended shop straight back to approved - no re-review needed. */
    public function reactivateApplication(int $id): JsonResponse
    {
        $shop = Shop::find($id);
        if (!$shop) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }
        if ($shop->status !== Shop::STATUS_SUSPENDED) {
            return response()->json(['success' => false, 'message' => 'Only a suspended shop can be reactivated.'], 422);
        }

        $shop->update(['status' => Shop::STATUS_APPROVED]);

        return response()->json(['success' => true, 'data' => ['status' => $shop->status]]);
    }

    /* ── Country seller-requirements config ──────────────────────────────── */

    public function countryRequirements(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => CountrySellerRequirement::orderBy('country_code')->orderBy('seller_type')->get(),
        ]);
    }

    public function storeCountryRequirement(Request $request): JsonResponse
    {
        $data = $this->validatedRequirement($request, null);
        $row = CountrySellerRequirement::create($data);

        return response()->json(['success' => true, 'data' => $row], 201);
    }

    public function updateCountryRequirement(Request $request, int $id): JsonResponse
    {
        $row = CountrySellerRequirement::find($id);
        if (!$row) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }

        $row->update($this->validatedRequirement($request, $id));

        return response()->json(['success' => true, 'data' => $row]);
    }

    public function destroyCountryRequirement(int $id): JsonResponse
    {
        $row = CountrySellerRequirement::find($id);
        if (!$row) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }
        $row->delete();

        return response()->json(['success' => true]);
    }

    private function validatedRequirement(Request $request, ?int $ignoreId): array
    {
        // Normalized BEFORE validation so the uniqueness check and the
        // stored value agree - '*' (the fallback row) passes size:2 too.
        if ($request->filled('country_code') && $request->input('country_code') !== CountrySellerRequirement::FALLBACK_COUNTRY) {
            $request->merge(['country_code' => strtoupper((string) $request->input('country_code'))]);
        }

        return $request->validate([
            'country_code'        => [
                'required', 'string', 'max:2',
                Rule::unique('country_seller_requirements', 'country_code')
                    ->where('seller_type', $request->input('seller_type'))
                    ->ignore($ignoreId),
            ],
            'seller_type'         => ['required', Rule::in(Shop::SELLER_TYPES)],
            'required_fields'     => ['required', 'array'],
            'required_fields.*'   => ['string'],
            'required_documents'  => ['required', 'array'],
            'required_documents.*'=> ['string'],
            'requires_tax_form'   => ['sometimes', 'boolean'],
        ]);
    }
}
