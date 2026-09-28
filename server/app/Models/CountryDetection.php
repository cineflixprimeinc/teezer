<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CountryDetection extends Model
{
    protected $fillable = [
        'user_id',
        'detected_country_code',
        'detected_country_name',
        'detected_region',
        'detected_city',
        'detected_latitude',
        'detected_longitude',
        'detected_timezone',
        'detected_asn_number',
        'detected_isp_organization',
        'detected_at',
        'ip_hash',
        'source',
    ];

    protected $casts = [
        'detected_at'         => 'datetime',
        'detected_asn_number' => 'integer',
        'detected_latitude'   => 'float',
        'detected_longitude'  => 'float',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
