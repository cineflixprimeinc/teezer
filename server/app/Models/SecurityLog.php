<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SecurityLog extends Model
{
    protected $fillable = [
        'action',
        'severity',
        'ip_address',
        'identifier_type',
        'identifier',
        'action_type',
        'description',
        'metadata',
    ];

    protected function casts(): array
    {
        return ['metadata' => 'array'];
    }
}
