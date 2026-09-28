<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Currency;
use App\Models\Product;
use App\Models\ProductVariationType;
use App\Models\Shop;
use App\Models\ShopCategory;
use App\Models\ShopCoupon;
use App\Models\ShopCouponClaim;
use App\Models\ShopDeal;
use App\Models\ShopPromoBanner;
use App\Models\User;
use App\Models\Video;
use App\Services\PricingService;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/**
 * The public storefront a user's Shop tab opens, plus the one seller-facing
 * write endpoint (`storeProduct`) - the "Add New Product" form. The read
 * methods mirror UserController's `{username}` lookup +
 * `optional.sanctum` public-read pattern; `storeProduct` sits in the
 * `auth:sanctum` group instead (see routes/api.php), same split
 * UserController itself uses for its own `/drafts` route.
 */
class ShopController extends Controller
{
    public function __construct(
        private readonly StorageService $storage,
        private readonly PricingService $pricing,
    ) {}

    /**
     * The caller's Shop row IF it is a real, public storefront - null
     * otherwise (no shop at all, or one that exists but isn't approved:
     * draft/incomplete/pending_review/needs_information/rejected/suspended).
     * Every public read method below goes through this rather than a bare
     * `Shop::where('user_id', ...)->first()`, so "not approved" degrades
     * exactly like "no shop yet" always has - an empty storefront, never an
     * error, and never the seller's private application data.
     */
    private function approvedShop(User $user): ?Shop
    {
        $shop = Shop::where('user_id', $user->id)->first();
        return $shop?->isApproved() ? $shop : null;
    }

    /**
     * The caller's Shop row when it's either a live storefront OR a
     * seller-paused one - the only two states allowed to reveal shop-
     * authored identity/policy fields (logo, category, policies, real
     * shop_name) to a public viewer. Every other non-approved state
     * (draft/incomplete/pending_review/needs_information/rejected/
     * suspended) still resolves to null here, exactly like approvedShop() -
     * a paused shop's pause_message is a message the SELLER wrote for
     * customers to read; none of those other states have anything
     * equivalent that's safe to show.
     */
    private function visibleShop(User $user): ?Shop
    {
        $shop = Shop::where('user_id', $user->id)->with('category')->first();
        return ($shop?->isApproved() || $shop?->isPaused()) ? $shop : null;
    }

    /** Storefront header: shop identity + owner's profile fields + tab counts. */
    public function show(string $username): JsonResponse
    {
        $user    = User::where('username', $username)->firstOrFail();
        $shop    = $this->approvedShop($user);
        $visible = $shop ?? $this->visibleShop($user);
        $paused  = $visible?->isPaused() ?? false;

        return response()->json([
            'success' => true,
            'data' => [
                // Whether this is a real, public storefront right now - the
                // client must gate on this, not on shop_name/tagline being
                // present, since those still fall back to account fields
                // below even when there's no approved shop to show.
                'available'     => $shop !== null,
                'shop_name'     => $visible?->shop_name ?? $user->name,
                'tagline'       => $visible?->tagline,
                'logo_url'      => $visible?->logoUrl(),
                'category'      => $visible?->category?->name,
                'policies'      => $visible?->policies,
                'is_live'       => (bool) $shop?->is_live,
                'rating_avg'    => (float) ($shop?->rating_avg ?? 0),
                'rating_count'  => (int) ($shop?->rating_count ?? 0),
                'sold_count'    => (int) ($shop?->sold_count ?? 0),
                // Only true for a shop the seller themselves paused via Shop
                // Settings - pause_message/paused_until are their own words,
                // meant to be read by customers while checkout is disabled.
                'is_paused'     => $paused,
                'pause_message' => $paused ? $visible->pause_message : null,
                'paused_until'  => $paused ? $visible->paused_until?->toIso8601String() : null,
                'user' => [
                    'id'          => $user->id,
                    'username'    => $user->username,
                    'name'        => $user->name,
                    'avatar'      => $user->avatar ? Storage::url($user->avatar) : StorageService::defaultAvatarUrl(),
                    'is_verified' => (bool) $user->is_verified,
                ],
                'counts' => [
                    'products'    => $shop ? Product::where('shop_id', $shop->id)->where('is_active', true)->count() : 0,
                    'videos'      => Video::where('user_id', $user->id)->whereNull('deleted_at')->count(),
                    'collections' => $shop ? $shop->collections()->count() : 0,
                    'reviews'     => (int) ($shop?->rating_count ?? 0),
                ],
            ],
        ]);
    }

    /** The [All] [Fashion] [Beauty]... carousel - global, not scoped to one shop. */
    public function categories(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => ShopCategory::where('is_active', true)
                ->orderBy('sort_order')
                ->get()
                ->map(fn (ShopCategory $c) => $c->toClientArray())
                ->values(),
        ]);
    }

    /** GET /shops/promo-banners - the marketplace home's promo carousel. */
    public function promoBanners(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => ShopPromoBanner::live()
                ->orderBy('sort_order')
                ->get()
                ->map(fn (ShopPromoBanner $b) => $b->toClientArray())
                ->values(),
        ]);
    }

    /** GET /shops/deals - "Deals of the day", each resolved against the real,
     *  live product it points at (never a stale/deleted one). */
    public function deals(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => ShopDeal::live()
                ->with('product:id,shop_id,name,image_url,price,currency,rating_avg,sold_count')
                ->orderBy('sort_order')
                ->get()
                ->map(fn (ShopDeal $d) => [
                    'id'               => $d->id,
                    'product_id'       => $d->product_id,
                    'name'             => $d->product->name,
                    'image_url'        => $this->productImageUrl($d->product->image_url),
                    'currency'         => $d->product->currency,
                    'original_price'   => (float) $d->product->price,
                    'deal_price'       => (float) $d->deal_price,
                    'discount_percent' => $d->discount_percent,
                    'rating_avg'       => (float) $d->product->rating_avg,
                    'sold_count'       => (int) $d->product->sold_count,
                    'ends_at'          => $d->ends_at?->toIso8601String(),
                ])
                ->values(),
        ]);
    }

    /** GET /shops/coupons - marketplace coupons, each flagged with whether
     *  the CURRENT viewer (if signed in) already claimed it, so the client
     *  never has to guess Claim vs Claimed with a second request. */
    public function coupons(Request $request): JsonResponse
    {
        $userId = $request->user()?->id;
        $claimedIds = $userId
            ? ShopCouponClaim::where('user_id', $userId)->pluck('shop_coupon_id')->all()
            : [];

        return response()->json([
            'success' => true,
            'data' => ShopCoupon::live()
                ->orderBy('sort_order')
                ->get()
                // Exhaustion is relative to the viewer, not the row: a coupon
                // with no room left for a NEW claimant must still show for
                // whoever already claimed it (as "Claimed"), rather than
                // vanishing out from under them the moment the last spot goes.
                ->filter(fn (ShopCoupon $c) =>
                    $c->usage_limit === null
                    || $c->used_count < $c->usage_limit
                    || in_array($c->id, $claimedIds, true))
                ->map(fn (ShopCoupon $c) => [
                    'id'          => $c->id,
                    'code'        => $c->code,
                    'title'       => $c->title,
                    'description' => $c->description,
                    'type'        => $c->type,
                    'value'       => $c->value !== null ? (float) $c->value : null,
                    'min_spend'   => $c->min_spend !== null ? (float) $c->min_spend : null,
                    'claimed'     => in_array($c->id, $claimedIds, true),
                ])
                ->values(),
        ]);
    }

    /**
     * POST /shops/coupons/{id}/claim - adds a coupon to the caller's own
     * wallet. This is a CLAIM, not a checkout redemption - see
     * ShopCouponClaim's doc comment for why (no marketplace checkout exists
     * yet to redeem against). lockForUpdate mirrors CouponService::redeem's
     * own transactional pattern, so two rapid taps can never both succeed
     * against a capped coupon.
     */
    public function claimCoupon(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        return DB::transaction(function () use ($user, $id) {
            $coupon = ShopCoupon::where('id', $id)->lockForUpdate()->first();
            if (!$coupon || !$coupon->is_active) {
                return response()->json(['success' => false, 'message' => 'Not found.'], 404);
            }
            if ($coupon->starts_at && $coupon->starts_at->isFuture()) {
                return response()->json(['success' => false, 'message' => 'This coupon is not live yet.'], 422);
            }
            if ($coupon->ends_at && $coupon->ends_at->isPast()) {
                return response()->json(['success' => false, 'message' => 'This coupon has expired.'], 422);
            }

            // Checked BEFORE the exhaustion check below: a repeat tap from
            // someone who already holds this coupon is about THEIR claim,
            // not the pool - "you already have this" is the true, useful
            // answer even if the pool has since run out for everyone else.
            $already = ShopCouponClaim::where('shop_coupon_id', $coupon->id)
                ->where('user_id', $user->id)->exists();
            if ($already) {
                return response()->json(['success' => false, 'message' => 'You already claimed this coupon.'], 409);
            }

            if ($coupon->usage_limit !== null && $coupon->used_count >= $coupon->usage_limit) {
                return response()->json(['success' => false, 'message' => 'This coupon has run out.'], 422);
            }

            ShopCouponClaim::create([
                'shop_coupon_id' => $coupon->id,
                'user_id'        => $user->id,
                'created_at'     => now(),
            ]);
            $coupon->increment('used_count');

            return response()->json(['success' => true]);
        });
    }

    /** GET /shop/variation-types - preset variation types (Size, Color, ...) for the
     *  Add Product "Add Variation" sheet's dropdown - see ProductVariationType. */
    public function variationTypes(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => ProductVariationType::active()
                ->orderBy('sort_order')
                ->get()
                ->map(fn (ProductVariationType $t) => $t->toClientArray())
                ->values(),
        ]);
    }

    /** GET /shop/currencies - every enabled currency, for the Add Product price field's
     *  currency picker. Same enabled set PricingService quotes Premium/subscriptions in. */
    public function currencies(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => Currency::enabled()->orderBy('code')->get()->map(fn (Currency $c) => [
                'code'   => $c->code,
                'symbol' => $c->symbol,
                'name'   => $c->name,
            ])->values(),
        ]);
    }

    /**
     * GET /shop/detect-currency - the seller's own default currency for the Add
     * Product price field, auto-detected from the same Cloudflare-country signal
     * PricingService already uses for Premium (see its own detectCountry() for the
     * priority order). Just a default: storeProduct() below accepts ANY enabled
     * currency the seller picks instead - this only saves them from having to find
     * their own currency in a 46-entry list on every product they list.
     */
    public function detectCurrency(Request $request): JsonResponse
    {
        $country  = $this->pricing->detectCountry($request);
        $currency = $this->pricing->currencyForCountry($country);
        $meta     = Currency::where('code', $currency)->first();

        return response()->json([
            'success' => true,
            'data' => [
                'country_code' => $country,
                'currency'     => $currency,
                'symbol'       => $meta?->symbol ?? '$',
            ],
        ]);
    }

    /** Paginated product grid, with the storefront's Recommended/Best sellers/New/Price sort + category filter. */
    public function products(Request $request, string $username): JsonResponse
    {
        $user = User::where('username', $username)->firstOrFail();
        $shop = $this->approvedShop($user);

        $sort = $request->input('sort', 'recommended');
        if (!in_array($sort, Product::SORTS, true)) {
            $sort = 'recommended';
        }

        $query = $shop
            ? $shop->products()->where('is_active', true)
            : Product::query()->whereRaw('1 = 0'); // no shop yet - empty page, not an error

        // "All" (the default carousel pill) sends no category param at all.
        if ($category = $request->input('category')) {
            $query->whereHas('category', fn ($q) => $q->where('slug', $category));
        }

        // Mobile's Shop page search box - name only, not description, so a
        // match always reads obviously relevant in the results grid.
        if ($search = trim((string) $request->input('search', ''))) {
            $query->where('name', 'like', '%' . str_replace(['%', '_'], ['\\%', '\\_'], $search) . '%');
        }

        match ($sort) {
            'best_sellers' => $query->orderByDesc('sold_count'),
            'new_arrivals' => $query->orderByDesc('created_at'),
            'price_asc'    => $query->orderBy('price'),
            'price_desc'   => $query->orderByDesc('price'),
            default        => $query->orderBy('sort_order')->orderByDesc('created_at'),
        };

        $products = $query->paginate($request->input('per_page', 20));

        return response()->json([
            'success' => true,
            'data' => collect($products->items())->map(fn (Product $p) => [
                'id'            => $p->id,
                'name'          => $p->name,
                'price'         => (float) $p->price,
                'currency'      => $p->currency,
                'image_url'     => $this->productImageUrl($p->image_url),
                'badge'         => $p->badge,
                'rating_avg'    => (float) $p->rating_avg,
                'rating_count'  => (int) $p->rating_count,
                'sold_count'    => (int) $p->sold_count,
                'colors'        => $p->colors ?? [],
            ])->values(),
            'meta' => [
                'current_page' => $products->currentPage(),
                'last_page'    => $products->lastPage(),
                'per_page'     => $products->perPage(),
                'total'        => $products->total(),
                'next_page_url'=> $products->nextPageUrl(),
            ],
        ]);
    }

    /**
     * Single-product detail - everything `products()`'s card list omits
     * (description, full images, stock, variations, allow_cod/is_digital)
     * that a detail/checkout screen needs. Public, same as the rest of this
     * controller's reads; a product only resolves here while its shop is a
     * real, approved storefront - same rule as `approvedShop()` above.
     */
    public function productShow(int $id): JsonResponse
    {
        $product = Product::with('shop.user')->findOrFail($id);
        $shop = $product->shop;
        if (!$shop || !$shop->isApproved() || !$product->is_active) {
            abort(404);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'id'               => $product->id,
                'name'             => $product->name,
                'description'      => $product->description,
                'price'            => (float) $product->price,
                'compare_at_price' => $product->compare_at_price !== null ? (float) $product->compare_at_price : null,
                'currency'         => $product->currency,
                'image_url'        => $this->productImageUrl($product->image_url),
                'images'           => array_values(array_filter(array_map(fn ($i) => $this->productImageUrl($i), $product->images ?? []))),
                'badge'            => $product->badge,
                'colors'           => $product->colors ?? [],
                'variations'       => $product->variations ?? [],
                'rating_avg'       => (float) $product->rating_avg,
                'rating_count'     => (int) $product->rating_count,
                'sold_count'       => (int) $product->sold_count,
                'stock'            => (int) $product->stock,
                'is_digital'       => (bool) $product->is_digital,
                'allow_cod'        => (bool) $product->allow_cod,
                'shipping_type'    => $product->shipping_type,
                'shop' => [
                    'username'    => $shop->user?->username,
                    'name'        => $shop->shop_name,
                    'avatar'      => $shop->user?->avatar ? Storage::url($shop->user->avatar) : StorageService::defaultAvatarUrl(),
                    'is_verified' => (bool) $shop->user?->is_verified,
                ],
            ],
        ]);
    }

    /** Collection cards ("Summer Collection", "New Arrivals"...) shown below the grid. */
    public function collections(string $username): JsonResponse
    {
        $user = User::where('username', $username)->firstOrFail();
        $shop = $this->approvedShop($user);

        $collections = $shop
            ? $shop->collections()->withCount('products')->orderBy('sort_order')->get()
            : collect();

        return response()->json([
            'success' => true,
            'data' => $collections->map(fn ($c) => [
                'id'              => $c->id,
                'name'            => $c->name,
                'cover_image_url' => $this->productImageUrl($c->cover_image_url),
                'products_count'  => (int) $c->products_count,
            ])->values(),
        ]);
    }

    /** Paginated shop-level reviews. */
    public function reviews(Request $request, string $username): JsonResponse
    {
        $user = User::where('username', $username)->firstOrFail();
        $shop = $this->approvedShop($user);

        $reviews = $shop
            ? $shop->reviews()->with('user:id,name,username,avatar')
                ->orderByDesc('created_at')->paginate($request->input('per_page', 20))
            : new \Illuminate\Pagination\LengthAwarePaginator([], 0, 20);

        return response()->json([
            'success' => true,
            'data' => collect($reviews->items())->map(fn ($r) => [
                'id'              => $r->id,
                'rating'          => (int) $r->rating,
                'comment'         => $r->comment,
                'seller_reply'    => $r->seller_reply,
                'seller_reply_at' => $r->seller_reply_at?->toIso8601String(),
                'user' => [
                    'name'     => $r->user?->name,
                    'username' => $r->user?->username,
                    'avatar'   => $r->user?->avatar ? Storage::url($r->user->avatar) : StorageService::defaultAvatarUrl(),
                ],
                'created_at' => $r->created_at?->toIso8601String(),
            ])->values(),
            'meta' => [
                'current_page' => $reviews->currentPage(),
                'last_page'    => $reviews->lastPage(),
                'per_page'     => $reviews->perPage(),
                'total'        => $reviews->total(),
            ],
        ]);
    }

    /* ── Seller-facing review management (Shop Settings > Products > Product Reviews) ──
       shop_reviews is shop-wide, not per-product (see reviews() above and
       the table's own docblock) - "Product Reviews" here means this shop's
       whole review feed, with the seller able to reply. There was no
       seller-facing read or write path for reviews at all until now. */

    /** GET /shop/reviews/mine - the seller's own shop's reviews (same feed as the public reviews() read, seller-scoped). */
    public function sellerReviews(Request $request): JsonResponse
    {
        $shop = Shop::where('user_id', $request->user()->id)->firstOrFail();

        $reviews = $shop->reviews()->with('user:id,name,username,avatar')
            ->orderByDesc('created_at')->paginate($request->input('per_page', 20));

        return response()->json([
            'success' => true,
            'data' => collect($reviews->items())->map(fn ($r) => $this->toSellerReviewArray($r))->values(),
            'meta' => [
                'current_page' => $reviews->currentPage(),
                'last_page'    => $reviews->lastPage(),
                'total'        => $reviews->total(),
            ],
        ]);
    }

    /** PUT /shop/reviews/{id}/reply - one reply per review; calling again replaces it, not a thread. */
    public function replyToReview(Request $request, int $id): JsonResponse
    {
        $shop = Shop::where('user_id', $request->user()->id)->firstOrFail();
        $review = \App\Models\ShopReview::where('id', $id)->where('shop_id', $shop->id)->firstOrFail();

        $data = $request->validate(['reply' => ['required', 'string', 'max:1000']]);

        $review->update(['seller_reply' => $data['reply'], 'seller_reply_at' => now()]);

        return response()->json(['success' => true, 'data' => $this->toSellerReviewArray($review->fresh('user'))]);
    }

    private function toSellerReviewArray(\App\Models\ShopReview $review): array
    {
        return [
            'id'              => $review->id,
            'rating'          => (int) $review->rating,
            'comment'         => $review->comment,
            'seller_reply'    => $review->seller_reply,
            'seller_reply_at' => $review->seller_reply_at?->toIso8601String(),
            'user' => [
                'name'     => $review->user?->name,
                'username' => $review->user?->username,
                'avatar'   => $review->user?->avatar ? Storage::url($review->user->avatar) : StorageService::defaultAvatarUrl(),
            ],
            'created_at' => $review->created_at?->toIso8601String(),
        ];
    }

    /**
     * The "Add New Product" form. Auto-provisions the caller's Shop row on
     * their very first product - there is no separate "set up your shop"
     * step, and a seller shouldn't have to find one before they can list
     * anything.
     */
    public function storeProduct(Request $request): JsonResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'name'              => ['required', 'string', 'max:120'],
            'description'       => ['required', 'string', 'max:1000'],
            'category_id'       => ['required', 'integer', 'exists:shop_categories,id'],
            'subcategory_id'    => ['nullable', 'integer', 'exists:shop_categories,id'],
            'price'             => ['required', 'numeric', 'min:0'],
            'currency'          => ['nullable', 'string', Rule::exists('currencies', 'code')->where('is_enabled', true)],
            'compare_at_price'  => ['nullable', 'numeric', 'min:0'],
            'sku'               => ['nullable', 'string', 'max:60'],
            'stock'             => ['required', 'integer', 'min:0'],
            'shipping_type'     => ['nullable', 'string', 'max:60'],
            'is_digital'        => ['sometimes', 'boolean'],
            'allow_cod'         => ['sometimes', 'boolean'],
            'is_active'         => ['sometimes', 'boolean'],
            'variations'        => ['nullable', 'array', 'max:10'],
            'variations.*.name'    => ['required_with:variations', 'string', 'max:40'],
            'variations.*.options' => ['required_with:variations', 'array', 'min:1'],
            'variations.*.options.*' => ['string', 'max:40'],
            'images'            => ['nullable', 'array', 'max:8'],
            // 20MB/photo (20480 KB - Laravel's file `max` is always KB). Also
            // needs nginx's client_max_body_size on reelsoo-api.conf raised
            // to cover 8 photos near the cap in one request - see deploy notes.
            'images.*'          => ['file', 'image', 'max:20480'],
        ]);

        $shop = Shop::firstOrCreate(
            ['user_id' => $user->id],
            ['shop_name' => $user->name ?? $user->username],
        );

        $imageKeys = [];
        foreach ($request->file('images', []) as $file) {
            if ($file && $file->isValid()) {
                $imageKeys[] = $this->storage->storeImage($file, 'products');
            }
        }
        // Keys, deliberately - NOT $this->storage->url(...). The media disk
        // signs its URLs with an expiry, so storing the signed string froze a
        // deadline into the row: every product's photo went blank the moment
        // its token lapsed, however long after upload that was. The column
        // holds the key and each response signs a fresh URL, which is what
        // productImageUrl() below does.

        // A subcategory, if chosen, is the more specific tag - it wins over
        // the top-level category for filtering/display purposes.
        $categoryId = $data['subcategory_id'] ?? $data['category_id'];

        // The seller can pick any enabled currency (storeProduct's own validation
        // above already confirmed it's a real, enabled one); absent that, default
        // to the same country-detected currency the price field pre-fills with, so
        // a client that skips the field entirely doesn't silently land on NPR.
        $currency = $data['currency'] ?? $this->pricing->currencyForCountry($this->pricing->detectCountry($request));

        $product = Product::create([
            'shop_id'          => $shop->id,
            'category_id'      => $categoryId,
            'name'             => $data['name'],
            'description'      => $data['description'],
            'sku'              => $data['sku'] ?? null,
            'price'            => $data['price'],
            'currency'         => $currency,
            'compare_at_price' => $data['compare_at_price'] ?? null,
            'stock'            => $data['stock'],
            'images'           => $imageKeys,
            'image_url'        => $imageKeys[0] ?? null,
            'variations'       => $data['variations'] ?? [],
            'shipping_type'    => $data['shipping_type'] ?? null,
            'is_digital'       => $data['is_digital'] ?? false,
            'allow_cod'        => $data['allow_cod'] ?? true,
            'is_active'        => $data['is_active'] ?? true,
            'badge'            => 'new',
        ]);

        return response()->json(['success' => true, 'data' => $product], 201);
    }

    /* ── Seller-facing product management (Shop Settings > Products & Inventory) ──
       storeProduct() above is create-only; until now there was no way to
       edit stock/visibility afterward, and no seller-facing list that
       included drafts/hidden products (the public products() read above is
       always filtered to is_active=true). */

    /** GET /shop/products/mine - the seller's own products, unfiltered by is_active (unlike the public read). */
    public function myProducts(Request $request): JsonResponse
    {
        $shop = Shop::where('user_id', $request->user()->id)->firstOrFail();

        // "Add link" -> Reelsoo Product picker (see PostCameraScreenImpl)
        // reuses this same endpoint and needs to search by name, know each
        // product's category for its "Recommended for this post" sorting,
        // and see ONLY products that can actually be attached to a post -
        // all three additive, existing Settings/inventory callers are
        // unaffected since none of these params are required. Without
        // active_only, the picker showed drafts/hidden products with no
        // indicator, and VideoService::syncFeaturedProducts (correctly)
        // drops any inactive product server-side at save time with no
        // error surfaced - a product picked there would silently never
        // attach. Filtering the picker's OWN list to eligible products is
        // the right layer for this, not weakening that server-side check.
        $search = trim((string) $request->input('search', ''));
        $activeOnly = $request->boolean('active_only');

        $products = $shop->products()
            ->with('category')
            ->when($search !== '', fn ($q) => $q->where('name', 'like', '%' . $search . '%'))
            ->when($activeOnly, fn ($q) => $q->where('is_active', true))
            ->orderByDesc('created_at')
            ->paginate($request->input('per_page', 30));

        return response()->json([
            'success' => true,
            'data' => collect($products->items())->map(fn (Product $p) => $this->toSellerProductArray($p))->values(),
            'meta' => [
                'current_page' => $products->currentPage(),
                'last_page'    => $products->lastPage(),
                'total'        => $products->total(),
                // Shop-wide, not just this page - the Settings hub renders a
                // "N products - M low stock" status line and would otherwise
                // have to fetch every page to count correctly.
                'low_stock_count' => $shop->products()->whereColumn('stock', '<=', 'low_stock_threshold')->count(),
            ],
        ]);
    }

    /**
     * PATCH /shop/products/{id} - stock, visibility and the low-stock
     * threshold only. Deliberately not full re-editing of name/price/images/
     * description - that stays create-time-only for this pass, matching the
     * plan's "smallest clean structure" scope.
     */
    public function updateProduct(Request $request, int $id): JsonResponse
    {
        $shop = Shop::where('user_id', $request->user()->id)->firstOrFail();
        $product = Product::where('id', $id)->where('shop_id', $shop->id)->firstOrFail();

        $data = $request->validate([
            'stock'                => ['sometimes', 'integer', 'min:0'],
            'is_active'            => ['sometimes', 'boolean'],
            'low_stock_threshold'  => ['sometimes', 'integer', 'min:0'],
        ]);

        if ($data) {
            $product->update($data);
        }

        return response()->json(['success' => true, 'data' => $this->toSellerProductArray($product->fresh())]);
    }

    private function toSellerProductArray(Product $product): array
    {
        return [
            'id'                   => $product->id,
            'name'                 => $product->name,
            'price'                => (float) $product->price,
            'currency'             => $product->currency,
            'image_url'            => $this->productImageUrl($product->image_url),
            'stock'                => (int) $product->stock,
            'low_stock_threshold'  => (int) $product->low_stock_threshold,
            'is_low_stock'         => $product->isLowStock(),
            'is_active'            => (bool) $product->is_active,
            'sold_count'           => (int) $product->sold_count,
            'created_at'           => $product->created_at?->toIso8601String(),
            'category_id'          => $product->category_id,
            'category_name'        => $product->category?->name,
        ];
    }

    /**
     * A currently-valid URL for a stored product image.
     *
     * The media disk signs URLs with an expiry, so a link is only good for a
     * while and has to be minted per response rather than kept.
     *
     * Handles both shapes on purpose. New rows hold a key and are signed
     * directly. Rows written before this fix hold a whole signed URL whose
     * token has since died; rather than migrate them, the path is taken back
     * out and re-signed, so those products start working again on their next
     * read with no backfill and no downtime.
     */
    private function productImageUrl(?string $value): ?string
    {
        if (! $value) {
            return null;
        }

        // Old row: pull the key back out of the stored URL. parse_url drops the
        // query string, which is exactly the stale token we want gone.
        if (str_starts_with($value, 'http://') || str_starts_with($value, 'https://')) {
            $value = ltrim((string) parse_url($value, PHP_URL_PATH), '/');
            if ($value === '') {
                return null;
            }
        }

        return $this->storage->url($value);
    }
}
