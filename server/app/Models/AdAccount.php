<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AdAccount extends Model
{
    protected $fillable = [
        'user_id', 'name', 'type', 'status',
        'balance_cents', 'lifetime_spent_cents', 'currency', 'timezone',
        'contact_email', 'meta',
    ];

    protected $casts = [
        'balance_cents'        => 'integer',
        'lifetime_spent_cents' => 'integer',
        'meta'                 => 'array',
    ];

    /**
     * The advertiser's public Ad Account number, e.g. ACCT-83271-9920.
     *
     * Derived deterministically from the immutable primary key, so it is stable
     * and permanent for the account (same value on every login / device) and is
     * IDENTICAL in the admin console and the advertiser's own Ads Manager
     * (ads.teezer.live). There is no separate stored column - the account row
     * (one per user) IS the identity; this is its human-facing rendering.
     */
    public function accountNumber(): string
    {
        $seed = $this->id * 7919 + 100000;
        return sprintf('ACCT-%05d-%04d', $seed % 100000, ($seed * 13) % 10000);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function campaigns(): HasMany
    {
        return $this->hasMany(AdCampaign::class);
    }

    public function ledgerEntries(): HasMany
    {
        return $this->hasMany(AdLedgerEntry::class, 'ad_account_id');
    }
}
