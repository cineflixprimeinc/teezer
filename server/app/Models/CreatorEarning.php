<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CreatorEarning extends Model
{
    protected $fillable = [
        'user_id', 'video_id', 'source', 'amount', 'currency', 'status', 'note', 'earned_at',
    ];

    protected function casts(): array
    {
        return [
            'amount'    => 'decimal:2',
            'earned_at' => 'datetime',
        ];
    }

    public function user()  { return $this->belongsTo(User::class); }
    public function video() { return $this->belongsTo(Video::class); }

    public static function sourceLabelMap(): array
    {
        return [
            'ad_revenue'  => 'Short Video Ads',
            'live_gift'   => 'Live Gifts',
            'subscription'=> 'Subscriptions',
            'brand_collab'=> 'Brand Collabs',
            'series'      => 'Series Earnings',
            // Matches the "Sell on Reelsoo" programme's own label (see the
            // 2026_08_19_000006 migration) - same name everywhere an earning
            // from this programme is shown, per the programme-list convention.
            'shop'        => 'Sell on Teezer',
        ];
    }
}
