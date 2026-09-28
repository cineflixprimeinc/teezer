<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A buyable premium tier (Starter / Pro / Studio).
 *
 * Describes what CAN be bought. `Subscription` records what HAS been bought and
 * is untouched by this - see the note in the create migration.
 */
class SubscriptionPlan extends Model
{
    protected $fillable = [
        'key', 'name', 'tagline', 'base_price_usd', 'app_price_usd', 'price', 'currency', 'period',
        'features', 'is_popular', 'badge_label', 'is_default', 'theme',
        'ios_product_id', 'android_product_id', 'sort', 'is_enabled',
        // Presentation / organisation - admin-facing only.
        'icon_path', 'category', 'tags', 'internal_note',
        // Availability. `status` is authoritative and `is_enabled` mirrors it -
        // see the 000006 migration for why both are kept.
        'status', 'platforms', 'visibility', 'purchase_eligibility', 'requirements',
        'available_from', 'available_until', 'countries_mode', 'countries',
        'upgrade_rules', 'downgrade_rules', 'existing_subscriber_behavior',
        // Null = inherit the global premium_trial_days; 0 = no trial here.
        'trial_days',
        // 'global' | 'country' - whether per-country overrides are consulted.
        'pricing_mode',
        // Discounts: the price being discounted FROM. Null = no discount.
        'compare_at_price_usd', 'compare_at_app_price_usd', 'discount_label',
    ];

    protected function casts(): array
    {
        return [
            'price'          => 'decimal:2',
            'base_price_usd' => 'decimal:2',
            'compare_at_price_usd' => 'decimal:2',
            'compare_at_app_price_usd' => 'decimal:2',
            'app_price_usd'  => 'decimal:2',
            'features'   => 'array',
            'tags'       => 'array',
            'platforms'     => 'array',
            'visibility'    => 'array',
            'requirements'  => 'array',
            'countries'     => 'array',
            'upgrade_rules' => 'array',
            'downgrade_rules' => 'array',
            'available_from'  => 'datetime',
            'available_until' => 'datetime',
            'is_popular' => 'boolean',
            'is_default' => 'boolean',
            'is_enabled' => 'boolean',
        ];
    }

    public function scopeEnabled($query)
    {
        return $query->where('is_enabled', true);
    }

    /**
     * The USD price for a surface.
     *
     * 'app' falls back to the web price when app_price_usd is null - null means
     * "same as web" and is how the two stay linked. Returns null only when no
     * base price has been set at all, which callers must treat as "not priced
     * yet" rather than as free.
     */
    public function priceUsdFor(string $surface = 'web'): ?float
    {
        if ($surface === 'app' && $this->app_price_usd !== null) {
            return (float) $this->app_price_usd;
        }

        return $this->base_price_usd !== null ? (float) $this->base_price_usd : null;
    }

    /** True when the app charges something different from the website. */
    public function hasSeparateAppPrice(): bool
    {
        return $this->app_price_usd !== null;
    }

    /** The store product id for the platform asking, or null if unlisted. */
    public function productIdFor(?string $platform): ?string
    {
        return $platform === 'ios' ? $this->ios_product_id : $this->android_product_id;
    }
}
