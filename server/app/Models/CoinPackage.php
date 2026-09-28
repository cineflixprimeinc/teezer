<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CoinPackage extends Model
{
    protected $fillable = [
        'plan_name', 'coins', 'price_usd', 'badge', 'icon',
        // Bonus coins. Stored apart from `coins` so the page can say
        // "1000 + 200 bonus" and the promotion stays visible as its own fact.
        'bonus_coins', 'bonus_percent', 'bonus_label', 'bonus_ends_at', 'bonus_enabled',
        // Uploaded artwork. When set it overrides the static SVG named by `icon`,
        // which is the only way an admin can change a gift's look without a deploy.
        'icon_url',
        'is_front_visible', 'is_active', 'sort_order',
        /* Store product ids. Coins are digital content, so StoreKit and Play
           Billing are the only permitted checkout in the apps - a pack without
           an id for a platform simply cannot be sold there. Absent from
           $fillable until now, which meant the admin panel could send them and
           they would be silently dropped. */
        'ios_product_id', 'android_product_id',
    ];

    protected $casts = [
        'coins'            => 'integer',
        'price_usd'        => 'decimal:2',
        'is_front_visible' => 'boolean',
        'is_active'        => 'boolean',
        'sort_order'       => 'integer',
        'bonus_coins'      => 'integer',
        'bonus_percent'    => 'decimal:2',
        'bonus_enabled'    => 'boolean',
        'bonus_ends_at'    => 'datetime',
    ];

    public function orders(): HasMany
    {
        return $this->hasMany(CoinOrder::class, 'package_id');
    }

    /** Dollar value per coin. */
    public function getPerCoinUsdAttribute(): float
    {
        return $this->coins > 0 ? round($this->price_usd / $this->coins, 4) : 0;
    }

    /* ── Bonus ──────────────────────────────────────────────────────────────
       One source of truth: every surface - website, app, admin, and the wallet
       credit itself - asks these, so a pack can never be advertised with one
       bonus and credited with another.
       ──────────────────────────────────────────────────────────────────────*/

    /** Whether a bonus is switched on AND has not run out. */
    public function hasBonus(): bool
    {
        if (! $this->bonus_enabled) {
            return false;
        }
        if ($this->bonus_ends_at && $this->bonus_ends_at->isPast()) {
            return false;
        }

        return $this->bonusCoins() > 0;
    }

    /**
     * Bonus coins earned, flat plus percentage. Derived, never stored - one
     * number to change and no chance of a stored total drifting from its parts.
     */
    public function bonusCoins(): int
    {
        $flat = max(0, (int) $this->bonus_coins);
        $pct  = (float) $this->bonus_percent;
        $from = $pct > 0 ? (int) round($this->coins * $pct / 100) : 0;

        return $flat + $from;
    }

    /** What the buyer actually receives. */
    public function totalCoins(): int
    {
        return $this->coins + ($this->hasBonus() ? $this->bonusCoins() : 0);
    }

    /**
     * How many extra coins this pack gives, always stated as a number.
     *
     * This is the line the buyer needs and it is NOT the admin's badge text.
     * A custom badge reading "New Now" is a promo tag; it says nothing about
     * what you get, and letting it stand in for the amount is exactly how a
     * pack ends up advertising a bonus nobody can quantify.
     */
    public function bonusAmountText(): ?string
    {
        if (! $this->hasBonus()) {
            return null;
        }

        return '+' . number_format($this->bonusCoins()) . ' bonus coins';
    }

    /**
     * The admin's optional promo tag. Shown IN ADDITION to the amount, never
     * instead of it.
     *
     * Percent formatting trims a trailing ".00" only - the previous rtrim
     * chain stripped every trailing zero, so 20.00 became "2" and a 20% bonus
     * advertised itself as "+2% BONUS".
     */
    public function bonusLabel(): ?string
    {
        if (! $this->hasBonus()) {
            return null;
        }
        if ($this->bonus_label) {
            return $this->bonus_label;
        }

        $pct = (float) $this->bonus_percent;
        if ($pct > 0) {
            $n = rtrim(rtrim(number_format($pct, 2, '.', ''), '0'), '.');
            // rtrim above eats the zero in "20.00" -> "2", so restore integers.
            if ($n === '' || (float) $n !== $pct) {
                $n = (string) (floor($pct) == $pct ? (int) $pct : $pct);
            }

            return '+' . $n . '% BONUS';
        }

        return '+' . number_format($this->bonusCoins()) . ' BONUS';
    }

    /** The shape every surface renders from. */
    public function bonusPayload(): array
    {
        return [
            'has_bonus'    => $this->hasBonus(),
            'base_coins'   => (int) $this->coins,
            'bonus_coins'  => $this->hasBonus() ? $this->bonusCoins() : 0,
            'total_coins'  => $this->totalCoins(),
            'bonus_label'  => $this->bonusLabel(),
            // The number the buyer actually needs, always present when a bonus
            // is running - independent of whatever badge text an admin typed.
            'bonus_text'   => $this->bonusAmountText(),
            'bonus_ends_at' => $this->bonus_ends_at?->toIso8601String(),
        ];
    }

    public function scopeActive($q)  { return $q->where('is_active', true); }
    public function scopeFront($q)   { return $q->where('is_front_visible', true); }
    public function scopeOrdered($q) { return $q->orderBy('sort_order'); }
}
