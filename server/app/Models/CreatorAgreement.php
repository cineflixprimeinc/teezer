<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A term a creator has accepted.
 *
 * The keys are the requirement metrics that are a promise rather than a number,
 * so a checklist row like "Original content pledge" has something real behind
 * it and its button does something.
 */
class CreatorAgreement extends Model
{
    /** Rewards: the videos you enrol are your own work. */
    public const CONTENT_PLEDGE = 'content_pledge';
    /** Affiliate: the merchant partner terms. */
    public const MERCHANT_TERMS = 'merchant_terms';
    /** Affiliate: tagged posts carry an affiliate label. */
    public const AFFILIATE_DISCLOSURE = 'affiliate_disclosure';

    public const KEYS = [
        self::CONTENT_PLEDGE,
        self::MERCHANT_TERMS,
        self::AFFILIATE_DISCLOSURE,
    ];

    protected $fillable = ['user_id', 'key', 'version', 'accepted_at', 'ip'];

    protected $casts = ['accepted_at' => 'datetime'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
