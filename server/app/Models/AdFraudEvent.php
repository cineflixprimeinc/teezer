<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AdFraudEvent extends Model
{
    protected $fillable = [
        'kind', 'ad_account_id', 'campaign_id', 'creative_id', 'user_id',
        'ip_hash', 'device_fp', 'score', 'action', 'amount_refunded_cents', 'details',
    ];

    protected $casts = [
        'score'                 => 'integer',
        'amount_refunded_cents' => 'integer',
        'details'               => 'array',
    ];
}
