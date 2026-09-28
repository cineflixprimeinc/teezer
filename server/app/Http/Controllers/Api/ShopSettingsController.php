<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Shop;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Settings -> Sell on Reelsoo -> Shop -> Edit Shop. The editor for an
 * ALREADY-APPROVED shop's public storefront fields - the "Shop Settings"
 * SellerApplicationController::update() has pointed to (but never actually
 * been) since the wizard was built. That controller is onboarding-only and
 * refuses every write once a shop is approved (see its own comment); this
 * one is the opposite - it refuses every write until a shop IS approved,
 * since there is nothing to "settings"-edit before that.
 *
 * Deliberately narrower than the wizard: only the fields that stay
 * meaningfully editable for the lifetime of a live storefront (name, logo,
 * category, description, shipping/returns/support policy). seller_type,
 * country_code, legal_data, documents and agreements are onboarding-only by
 * nature - changing any of those on a live shop is a re-verification event,
 * not a settings tweak, and none of them are reachable here.
 */
class ShopSettingsController extends Controller
{
    public function __construct(private readonly StorageService $storage)
    {
    }

    private function approvedShop(Request $request): Shop
    {
        return Shop::where('user_id', $request->user()->id)->firstOrFail();
    }

    /**
     * Both read and write share this - there is nothing to "settings"-edit
     * before a shop is a real storefront. Also allows STATUS_PAUSED: a
     * seller-paused shop is not a public storefront right now
     * (Shop::isApproved() correctly says false, hiding it everywhere the
     * public reads gate on that), but the seller themselves must still be
     * able to reach Settings - most importantly to resume() - so this is
     * deliberately broader than isApproved() alone.
     */
    private function requireApproved(Shop $shop): ?JsonResponse
    {
        if (! $shop->isApproved() && ! $shop->isPaused()) {
            return response()->json([
                'success' => false,
                'message' => 'Shop Settings is only available once your shop is approved.',
            ], 422);
        }

        return null;
    }

    /** GET /shop/settings */
    public function show(Request $request): JsonResponse
    {
        $shop = $this->approvedShop($request);
        if ($blocked = $this->requireApproved($shop)) {
            return $blocked;
        }

        return response()->json(['success' => true, 'data' => $this->toArray($shop)]);
    }

    /** PUT /shop/settings */
    public function update(Request $request): JsonResponse
    {
        $shop = $this->approvedShop($request);
        if ($blocked = $this->requireApproved($shop)) {
            return $blocked;
        }

        $data = $request->validate([
            'shop_name'   => ['sometimes', 'string', 'max:60'],
            'description' => ['sometimes', 'nullable', 'string', 'max:500'],
            'category_id' => ['sometimes', 'nullable', 'integer', 'exists:shop_categories,id'],
            'policies'    => ['sometimes', 'array'],
        ]);

        $update = array_filter([
            'shop_name'   => $data['shop_name'] ?? null,
            'category_id' => array_key_exists('category_id', $data) ? $data['category_id'] : null,
            'tagline'     => array_key_exists('description', $data) ? $data['description'] : null,
        ], fn ($v) => $v !== null);

        // Merge, not replace - saving just the Shipping section must not wipe
        // Returns/Support the seller already set, same reasoning as the
        // wizard's own update() for the exact same column.
        if (array_key_exists('policies', $data)) {
            $update['policies'] = array_merge($shop->policies ?? [], $data['policies']);
        }

        if ($update) {
            $shop->update($update);
        }

        return response()->json(['success' => true, 'data' => $this->toArray($shop->fresh())]);
    }

    /** POST /shop/settings/logo */
    public function uploadLogo(Request $request): JsonResponse
    {
        $shop = $this->approvedShop($request);
        if ($blocked = $this->requireApproved($shop)) {
            return $blocked;
        }

        $request->validate(['logo' => ['required', 'file', 'image', 'max:5120']]);

        $key = $this->storage->storeImage($request->file('logo'), 'shops');
        $shop->update(['logo_url' => $this->storage->url($key)]);

        return response()->json(['success' => true, 'data' => ['logo_url' => $shop->logoUrl()]]);
    }

    private function toArray(Shop $shop): array
    {
        return [
            'shop_name'   => $shop->shop_name,
            'description' => $shop->tagline,
            'logo_url'    => $shop->logoUrl(),
            'category_id' => $shop->category_id,
            'policies'    => $shop->policies,
            'status'         => $shop->status,
            'is_paused'      => $shop->isPaused(),
            'paused_until'   => $shop->paused_until?->toIso8601String(),
            'pause_message'  => $shop->pause_message,
        ];
    }

    /* ── Shop Operations > Pause Shop ─────────────────────────────────────
       Seller self-service equivalent of AdminShopController's suspend/
       reactivate - see this class's own docblock note and the
       2026_08_25_000001 migration for why STATUS_PAUSED is a new value of
       the existing status column rather than a separate flag. Pausing
       never deletes products or orders - it only flips status, which is
       exactly what every existing isApproved()-gated read/checkout path
       already uses to hide a non-live storefront; nothing else needed to
       change for the storefront/checkout to correctly disappear while
       paused. Does NOT surface pause_message to the public storefront (the
       customer-facing Shop page is explicitly out of scope for this pass) -
       it is only ever read back to the seller themselves, via show() above. */

    /** POST /shop/settings/pause */
    public function pause(Request $request): JsonResponse
    {
        $shop = $this->approvedShop($request);
        abort_unless($shop->isApproved(), 422, 'Only an active shop can be paused.');

        $data = $request->validate([
            'resume_date' => ['nullable', 'date', 'after:now'],
            'message'     => ['nullable', 'string', 'max:300'],
        ]);

        $shop->update([
            'status'        => Shop::STATUS_PAUSED,
            'paused_until'  => $data['resume_date'] ?? null,
            'pause_message' => $data['message'] ?? null,
        ]);

        return response()->json(['success' => true, 'data' => $this->toArray($shop->fresh())]);
    }

    /** POST /shop/settings/resume */
    public function resume(Request $request): JsonResponse
    {
        $shop = $this->approvedShop($request);
        abort_unless($shop->isPaused(), 422, 'This shop is not currently paused.');

        $shop->update([
            'status'        => Shop::STATUS_APPROVED,
            'paused_until'  => null,
            'pause_message' => null,
        ]);

        return response()->json(['success' => true, 'data' => $this->toArray($shop->fresh())]);
    }

    /* ── Customer Experience > Notifications ──────────────────────────────
       Same JSON-column + merge-defaults pattern as
       users.notification_preferences / ProfileController::getNotifications
       (2026_06_04_960001), just shop-scoped instead of account-scoped -
       reused deliberately rather than mixing shop toggles into the
       personal-account preference blob. Preferences are only ever stored/
       read here; nothing dispatches a notification off these keys yet (see
       the plan's "explicitly not building" - wiring actual sends into
       ShopOrderController/ShopReview is a separate, materially larger
       change touched deliberately not in this pass). */

    private const NOTIFICATION_DEFAULTS = [
        'new_order'      => true,
        'order_update'   => true,
        'payment'        => true,
        'return'         => true,
        'low_stock'      => true,
        'customer_message' => true,
        'review'         => true,
    ];

    /** GET /shop/settings/notifications */
    public function notificationPreferences(Request $request): JsonResponse
    {
        $shop = $this->approvedShop($request);
        if ($blocked = $this->requireApproved($shop)) {
            return $blocked;
        }

        return response()->json([
            'success' => true,
            'data' => array_merge(self::NOTIFICATION_DEFAULTS, $shop->notification_preferences ?? []),
        ]);
    }

    /** PUT /shop/settings/notifications */
    public function updateNotificationPreferences(Request $request): JsonResponse
    {
        $shop = $this->approvedShop($request);
        if ($blocked = $this->requireApproved($shop)) {
            return $blocked;
        }

        $rules = collect(self::NOTIFICATION_DEFAULTS)->keys()
            ->mapWithKeys(fn ($key) => [$key => ['sometimes', 'boolean']])->all();
        $data = $request->validate($rules);

        $shop->update([
            'notification_preferences' => array_merge($shop->notification_preferences ?? self::NOTIFICATION_DEFAULTS, $data),
        ]);

        return response()->json([
            'success' => true,
            'data' => array_merge(self::NOTIFICATION_DEFAULTS, $shop->fresh()->notification_preferences ?? []),
        ]);
    }
}
