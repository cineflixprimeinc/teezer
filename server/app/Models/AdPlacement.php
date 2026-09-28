<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AdPlacement extends Model
{
    protected $fillable = [
        'key', 'name', 'description', 'is_enabled',
        'first_slot', 'cadence', 'floor_cpm_cents', 'spec', 'sort_order',
    ];

    protected $casts = [
        'is_enabled'      => 'boolean',
        'first_slot'      => 'integer',
        'cadence'         => 'integer',
        'floor_cpm_cents' => 'integer',
        'spec'            => 'array',
        'sort_order'      => 'integer',
    ];
}
