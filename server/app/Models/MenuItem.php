<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MenuItem extends Model
{
    protected $fillable = [
        'key', 'label', 'icon', 'route', 'platform',
        'visibility', 'is_enabled', 'sort_order', 'parent_id',
    ];

    protected $casts = [
        'is_enabled'  => 'boolean',
        'visibility'  => 'array',
    ];
}
