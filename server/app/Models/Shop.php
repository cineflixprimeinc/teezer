<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A creator's storefront. Everything visitor-facing beyond `shop_name`/
 * `tagline` (avatar, handle, verified badge) is read off the owning User -
 * see the migration's docblock for why.
 *
 * `status` is the seller-onboarding lifecycle gate (see the
 * 2026_08_19_000001 migration): a Shop row existing is no longer the same
 * thing as it being a real, public storefront - only STATUS_APPROVED is.
 * Admin-controlled only; nothing in this codebase auto-approves a shop.
 */
class Shop extends Model
{
    public const STATUS_DRAFT = 'draft';
    public const STATUS_INCOMPLETE = 'incomplete';
    public const STATUS_PENDING_REVIEW = 'pending_review';
    public const STATUS_NEEDS_INFORMATION = 'needs_information';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_REJECTED = 'rejected';
    public const STATUS_SUSPENDED = 'suspended';
    /** Seller-initiated, reversible by the seller - unlike STATUS_SUSPENDED, which only an admin can lift. See the 2026_08_25_000001 migration's docblock for why this is a new status value rather than a separate flag. */
    public const STATUS_PAUSED = 'paused';

    public const STATUSES = [
        self::STATUS_DRAFT, self::STATUS_INCOMPLETE, self::STATUS_PENDING_REVIEW,
        self::STATUS_NEEDS_INFORMATION, self::STATUS_APPROVED, self::STATUS_REJECTED,
        self::STATUS_SUSPENDED, self::STATUS_PAUSED,
    ];

    public const SELLER_TYPE_INDIVIDUAL = 'individual';
    public const SELLER_TYPE_BUSINESS = 'business';
    public const SELLER_TYPES = [self::SELLER_TYPE_INDIVIDUAL, self::SELLER_TYPE_BUSINESS];

    protected $fillable = [
        'user_id', 'shop_name', 'tagline', 'is_live', 'status',
        'seller_type', 'country_code', 'shop_username', 'logo_url', 'category_id', 'policies',
        'paused_until', 'pause_message', 'notification_preferences',
    ];

    protected function casts(): array
    {
        return [
            'is_live'      => 'boolean',
            'rating_avg'   => 'float',
            'rating_count' => 'integer',
            'sold_count'   => 'integer',
            'policies'     => 'array',
            'paused_until' => 'datetime',
            'notification_preferences' => 'array',
        ];
    }

    /** The only check anywhere in the codebase for "is this a real, public storefront". */
    public function isApproved(): bool
    {
        return $this->status === self::STATUS_APPROVED;
    }

    public function isPaused(): bool
    {
        return $this->status === self::STATUS_PAUSED;
    }

    /** The shop's own logo if the seller uploaded one, else the owner's personal avatar. */
    public function logoUrl(): ?string
    {
        if ($this->logo_url) {
            return $this->logo_url;
        }

        $avatar = $this->user?->avatar;
        return $avatar ? \Illuminate\Support\Facades\Storage::url($avatar) : \App\Services\StorageService::defaultAvatarUrl();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(ShopCategory::class);
    }

    public function sellerProfile(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(SellerProfile::class);
    }

    public function documents(): HasMany
    {
        return $this->hasMany(SellerDocument::class);
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    public function collections(): HasMany
    {
        return $this->hasMany(ProductCollection::class);
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(ShopReview::class);
    }

    /** Recomputed after every review write - see ShopReview's save/delete hooks. */
    public function refreshRatingAggregate(): void
    {
        $this->rating_avg = (float) $this->reviews()->avg('rating') ?: 0;
        $this->rating_count = $this->reviews()->count();
        $this->save();
    }
}
