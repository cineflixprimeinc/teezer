<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CreatorMonetizationStatus extends Model
{
    protected $table = 'creator_monetization_status';

    protected $fillable = [
        'user_id', 'account_standing', 'ad_revenue_eligible',
        'live_gifts_enabled', 'subscriptions_enabled', 'tax_info_completed',
    ];

    protected function casts(): array
    {
        return [
            'account_standing'     => 'boolean',
            'ad_revenue_eligible'  => 'boolean',
            'live_gifts_enabled'   => 'boolean',
            'subscriptions_enabled'=> 'boolean',
            'tax_info_completed'   => 'boolean',
        ];
    }

    public function user() { return $this->belongsTo(User::class); }
}
