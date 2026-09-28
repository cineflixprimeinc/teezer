<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\CoinPackage;
use App\Models\Gift;
use App\Models\GiftTransaction;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Gifts & Coins management - ONE catalog of 200 gifts.
 *
 * The data is split across two tables, which is a historical accident, not a
 * design: `coin_packages` holds a gift's DOLLAR price (what you pay to buy it) and
 * `gifts` holds the SAME gift's COIN value (what it costs to send). They are joined
 * on coin_packages.icon == gifts.slug, and all 200 match.
 *
 * Presenting those as two "catalogs" made an admin edit half a gift and wonder why
 * the app disagreed with itself. So this controller stitches them back into one
 * row: read one gift, edit one gift, upload one icon, and BOTH tables move.
 *
 * (The `gifts` table also holds 5 retired rows - Rose/Heart/Crown/Rocket/Universe,
 * sort_order 0, no slug - from the original 5-gift catalog. They are kept because
 * gift_transactions still reference them, and they are not part of the 200.)
 *
 * Icons: a gift's `icon` is only a slug naming a static SVG shipped in the web app,
 * so it cannot be changed without a deploy. Uploading here writes `icon_url` on both
 * tables, which every client prefers over the slug - that is what makes artwork
 * editable at all.
 */
class AdminGiftCoinController extends Controller
{
    /** SVG is allowed on purpose (the whole catalog is SVG), so it must be sanitised. */
    private const ICON_RULES = ['file', 'mimetypes:image/png,image/jpeg,image/gif,image/webp,image/svg+xml', 'max:2048'];

    /* ── Overview ────────────────────────────────────────────────────────── */
    public function stats(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => [
                // The live catalog - what a user can actually buy. This is the number
                // that should match the storefront, and it does: 200.
                'packages_active' => CoinPackage::where('is_active', true)->count(),
                // Retired packs from the old pricing model. Kept only because a few
                // have paid orders behind them; invisible to users.
                'packages_retired' => CoinPackage::where('is_active', false)->count(),
                'packages'        => CoinPackage::count(),
                'gifts_active'    => Gift::where('is_active', true)->count(),
                'gifts'           => Gift::count(),
                'gifts_sent'      => GiftTransaction::count(),
                'coins_spent'     => (int) GiftTransaction::sum('total_coins'),
            ],
        ]);
    }

    /* ── Coin packages ───────────────────────────────────────────────────── */
    public function packages(Request $request): JsonResponse
    {
        $q = CoinPackage::query();

        if ($search = trim((string) $request->input('search'))) {
            $q->where(function ($sq) use ($search) {
                $sq->where('plan_name', 'ilike', "%{$search}%")
                   ->orWhere('icon', 'ilike', "%{$search}%")
                   ->orWhere('coins', (int) $search ?: 0)
                   ->orWhere('sort_order', (int) $search ?: 0);
            });
        }

        /* Default to the LIVE catalog - the 200 gifts a user can actually buy.
           There are also ~100 retired packs from the old pricing model (Starter
           Spark, Creator Vault, Business Pack …): plain coin bundles with no gift
           artwork, is_active=false, already excluded from the storefront. Listing
           them by default made the admin page disagree with the buy sheet for no
           reason. They stay reachable via status=retired, because a couple of them
           have real paid orders behind them and must not vanish. */
        $status = $request->input('status', 'active');
        if ($status === 'active') {
            $q->where('is_active', true);
        } elseif ($status === 'retired') {
            $q->where('is_active', false);
        }
        // status=all falls through: everything.

        $packages = $q->orderBy('sort_order')->paginate((int) $request->input('per_page', 24));

        // One query for the coin side of this page, rather than 24 lookups.
        $gifts = Gift::whereIn('slug', collect($packages->items())->pluck('icon')->filter())
            ->get()
            ->keyBy('slug');

        return response()->json([
            'success' => true,
            'data'    => collect($packages->items())->map(
                fn ($p) => $this->packageArray($p, $p->icon ? $gifts->get($p->icon) : null),
            ),
            'meta'    => [
                'current_page' => $packages->currentPage(),
                'last_page'    => $packages->lastPage(),
                'per_page'     => $packages->perPage(),
                'total'        => $packages->total(),
            ],
        ]);
    }

    public function storePackage(Request $request): JsonResponse
    {
        $data = $request->validate([
            'plan_name'        => ['required', 'string', 'max:120'],
            'coins'            => ['required', 'integer', 'min:1'],
            'price_usd'        => ['required', 'numeric', 'min:0.01', 'max:10000'],
            'coin_value'       => ['required', 'integer', 'min:1'],
            'badge'            => ['nullable', 'string', 'max:40'],
            'sort_order'       => ['nullable', 'integer', 'min:1'],
            'is_active'        => ['nullable', 'boolean'],
            'is_front_visible' => ['nullable', 'boolean'],
            // Bonus. Both forms are accepted because campaigns are written both
            // ways; the model derives the total from them and never stores it.
            'bonus_coins'      => ['nullable', 'integer', 'min:0', 'max:10000000'],
            'bonus_percent'    => ['nullable', 'numeric', 'min:0', 'max:500'],
            'bonus_label'      => ['nullable', 'nullable', 'string', 'max:40'],
            'bonus_ends_at'    => ['nullable', 'nullable', 'date'],
            'bonus_enabled'    => ['nullable', 'boolean'],
            /* Store product ids. These are what let a pack be SOLD in the app:
               coins are digital content, so StoreKit and Play Billing are the
               only permitted checkout there. A pack with no id for a platform
               is shown as unavailable in that app rather than linked out to
               the web, which would be an App Review rejection.
               Nullable and unique - two packs pointing at one product would
               credit the wrong number of coins on verification. */
            'ios_product_id'     => ['nullable', 'string', 'max:191', 'unique:coin_packages,ios_product_id'],
            'android_product_id' => ['nullable', 'string', 'max:191', 'unique:coin_packages,android_product_id'],
            'icon_file'        => array_merge(['nullable'], self::ICON_RULES),
        ]);

        // Append to the end of the catalog unless told otherwise.
        $data['sort_order'] ??= ((int) CoinPackage::max('sort_order')) + 1;
        $data['is_active'] ??= true;
        $data['is_front_visible'] ??= false;

        // The slug is the join between the two halves of a gift, so it is derived
        // here rather than typed - a mismatch would silently split the gift in two.
        $slug = Str::slug($data['plan_name']);
        if (Gift::where('slug', $slug)->exists()) {
            $slug .= '-' . Str::lower(Str::random(4));
        }

        $package = CoinPackage::create(array_merge(
            collect($data)->except(['icon_file', 'coin_value'])->all(),
            ['icon' => $slug],
        ));

        $iconPath = $request->hasFile('icon_file')
            ? $this->storeIcon($request->file('icon_file'))
            : null;

        if ($iconPath) {
            $package->update(['icon_url' => $iconPath]);
        }

        // A gift has to exist in BOTH tables or it can be bought and not sent.
        Gift::create([
            'slug'       => $slug,
            'name'       => $data['plan_name'],
            'coin_value' => $data['coin_value'],
            'icon_url'   => $iconPath
                ? Storage::disk(config('filesystems.default'))->url($iconPath)
                : null,
            'sort_order' => $data['sort_order'],
            'is_active'  => $data['is_active'],
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Gift created.',
            'data'    => $this->packageArray($package->fresh()),
        ], 201);
    }

    public function updatePackage(Request $request, int $id): JsonResponse
    {
        $package = CoinPackage::findOrFail($id);

        $data = $request->validate([
            'plan_name'        => ['sometimes', 'string', 'max:120'],
            'coins'            => ['sometimes', 'integer', 'min:1'],
            'price_usd'        => ['sometimes', 'numeric', 'min:0.01', 'max:10000'],
            'badge'            => ['sometimes', 'nullable', 'string', 'max:40'],
            'icon'             => ['sometimes', 'nullable', 'string', 'max:120'],
            'sort_order'       => ['sometimes', 'integer', 'min:1'],
            'is_active'        => ['sometimes', 'boolean'],
            'is_front_visible' => ['sometimes', 'boolean'],
            // The coin half. Editing a gift means editing both tables, or the app
            // ends up disagreeing with itself about the same gift.
            // Bonus. Both forms are accepted because campaigns are written both
            // ways; the model derives the total from them and never stores it.
            'bonus_coins'      => ['sometimes', 'integer', 'min:0', 'max:10000000'],
            'bonus_percent'    => ['sometimes', 'numeric', 'min:0', 'max:500'],
            'bonus_label'      => ['sometimes', 'nullable', 'string', 'max:40'],
            'bonus_ends_at'    => ['sometimes', 'nullable', 'date'],
            'bonus_enabled'    => ['sometimes', 'boolean'],
            'ios_product_id'     => ['sometimes', 'nullable', 'string', 'max:191', \Illuminate\Validation\Rule::unique('coin_packages', 'ios_product_id')->ignore($id)],
            'android_product_id' => ['sometimes', 'nullable', 'string', 'max:191', \Illuminate\Validation\Rule::unique('coin_packages', 'android_product_id')->ignore($id)],
            'coin_value'       => ['sometimes', 'integer', 'min:1'],
        ]);

        $package->update(collect($data)->except('coin_value')->all());

        $gift = $this->giftFor($package);
        if ($gift) {
            $giftUpdate = [];
            if (array_key_exists('coin_value', $data)) $giftUpdate['coin_value'] = $data['coin_value'];
            if (array_key_exists('plan_name', $data))  $giftUpdate['name']       = $data['plan_name'];
            // A gift you cannot buy should not be sendable either.
            if (array_key_exists('is_active', $data))  $giftUpdate['is_active']  = $data['is_active'];
            if ($giftUpdate) $gift->update($giftUpdate);
        }

        return response()->json([
            'success' => true,
            'message' => 'Gift updated.',
            'data'    => $this->packageArray($package->fresh()),
        ]);
    }

    /** POST /admin/coin-packages/{id}/icon - multipart, field `icon_file`. */
    public function uploadPackageIcon(Request $request, int $id): JsonResponse
    {
        $request->validate(['icon_file' => array_merge(['required'], self::ICON_RULES)]);

        $package = CoinPackage::findOrFail($id);
        $old     = $package->icon_url;

        $path = $this->storeIcon($request->file('icon_file'));
        $package->update(['icon_url' => $path]);

        // The same gift is sent from the `gifts` table, so its artwork has to move
        // too - otherwise the buy sheet and the gift sheet show different pictures
        // of the same gift.
        $gift = $this->giftFor($package);
        if ($gift) {
            $gift->update([
                'icon_url' => Storage::disk(config('filesystems.default'))->url($path),
            ]);
        }

        $this->deleteIcon($old);

        return response()->json([
            'success' => true,
            'message' => 'Icon updated.',
            'data'    => $this->packageArray($package->fresh()),
        ]);
    }

    /** Drop the upload and fall back to the slug artwork shipped with the app. */
    public function resetPackageIcon(int $id): JsonResponse
    {
        $package = CoinPackage::findOrFail($id);
        $this->deleteIcon($package->icon_url);
        $package->update(['icon_url' => null]);

        return response()->json([
            'success' => true,
            'message' => 'Icon reset to the default artwork.',
            'data'    => $this->packageArray($package->fresh()),
        ]);
    }

    public function destroyPackage(int $id): JsonResponse
    {
        $package = CoinPackage::findOrFail($id);
        $gift    = $this->giftFor($package);

        // A gift that has ever been bought is referenced by coin_orders, and one that
        // has ever been SENT is referenced by gift_transactions. Deleting either half
        // would orphan paid history, so retire it instead.
        $bought = $package->orders()->exists();
        $sent   = $gift && $gift->transactions()->exists();

        if ($bought || $sent) {
            $package->update(['is_active' => false, 'is_front_visible' => false]);
            $gift?->update(['is_active' => false]);

            return response()->json([
                'success' => true,
                'message' => 'This gift has been used before, so it was deactivated rather than deleted. History stays intact.',
            ]);
        }

        $this->deleteIcon($package->icon_url);
        $gift?->delete();
        $package->delete();

        return response()->json(['success' => true, 'message' => 'Gift deleted.']);
    }

    /* ── Helpers ─────────────────────────────────────────────────────────── */
    /** One gift, stitched from both tables. `$gift` is the coin half, if it exists. */
    private function packageArray(CoinPackage $p, ?Gift $gift = null): array
    {
        $gift ??= $p->icon ? Gift::where('slug', $p->icon)->first() : null;
        $url = fn (?string $path) => $path
            ? Storage::disk(config('filesystems.default'))->url($path)
            : null;

        return [
            'id'               => $p->id,
            'plan_name'        => $p->plan_name,
            'coins'            => (int) $p->coins,
            'price_usd'        => (float) $p->price_usd,
            'badge'            => $p->badge,
            'icon'             => $p->icon,
            'icon_url'         => $url($p->icon_url),
            'is_active'        => (bool) $p->is_active,
            'is_front_visible' => (bool) $p->is_front_visible,
            'sort_order'       => (int) $p->sort_order,
            // Bonus, as the model derives it. Admin, website and app all render
            // from this one payload, so a pack cannot be advertised with one
            // bonus and credited with another.
            'bonus_coins'      => (int) $p->bonus_coins,
            'bonus_percent'    => (float) $p->bonus_percent,
            'bonus_label'      => $p->bonus_label,
            'bonus_ends_at'    => $p->bonus_ends_at?->toIso8601String(),
            'bonus_enabled'    => (bool) $p->bonus_enabled,
            'bonus'            => $p->bonusPayload(),
            // Store products. `sellable_in_app` is the question an admin is
            // actually asking - it is derived, so it cannot disagree with the
            // ids beside it.
            'ios_product_id'     => $p->ios_product_id,
            'android_product_id' => $p->android_product_id,
            'sellable_ios'       => (bool) $p->ios_product_id,
            'sellable_android'   => (bool) $p->android_product_id,
            // The number a buyer actually compares packs on.
            'coins_per_usd'    => $p->price_usd > 0 ? (int) round($p->coins / (float) $p->price_usd) : 0,

            // The coin half of the same gift: what it costs a user to SEND it.
            'gift_id'          => $gift?->id,
            'coin_value'       => $gift ? (int) $gift->coin_value : null,
            'gift_active'      => $gift ? (bool) $gift->is_active : null,
        ];
    }

    /** The `gifts` row that is the same gift as this pack, if there is one. */
    private function giftFor(CoinPackage $p): ?Gift
    {
        return $p->icon ? Gift::where('slug', $p->icon)->first() : null;
    }

    private function storeIcon(\Illuminate\Http\UploadedFile $file): string
    {
        // An SVG is a script container - it can carry <script> and event handlers, and
        // it is served from our own origin, so an unsanitised upload here is stored XSS
        // against every user who opens the gift sheet. Strip the dangerous parts.
        if (strtolower((string) $file->getClientOriginalExtension()) === 'svg'
            || $file->getMimeType() === 'image/svg+xml') {
            $clean = $this->sanitiseSvg(file_get_contents($file->getRealPath()));
            $path  = 'gifts/icons/' . Str::uuid() . '.svg';
            Storage::disk(config('filesystems.default'))->put($path, $clean, 'public');

            return $path;
        }

        return app(StorageService::class)->storeImage($file, 'gifts/icons');
    }

    /** Remove scripting from an SVG: script tags, event handlers, and js/data URLs. */
    private function sanitiseSvg(string $svg): string
    {
        $svg = preg_replace('#<script\b[^>]*>.*?</script>#is', '', $svg) ?? $svg;
        $svg = preg_replace('#<(foreignObject|iframe|embed|object)\b[^>]*>.*?</\1>#is', '', $svg) ?? $svg;
        // on* handlers: onclick=, onload=, …
        $svg = preg_replace('#\son\w+\s*=\s*(".*?"|\'.*?\'|[^\s>]+)#is', '', $svg) ?? $svg;
        $svg = preg_replace('#(href|xlink:href)\s*=\s*([\'"])\s*(javascript|data):[^\'"]*\2#is', '', $svg) ?? $svg;

        return $svg;
    }

    private function deleteIcon(?string $path): void
    {
        // Only ever delete something we uploaded - never a slug or an external URL.
        if (! $path || ! Str::startsWith($path, 'gifts/icons/')) {
            return;
        }

        try {
            Storage::disk(config('filesystems.default'))->delete($path);
        } catch (\Throwable) {
            // A missing file is not worth failing the request over.
        }
    }
}
