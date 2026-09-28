<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GlobalControl extends Model
{
    protected $fillable = [
        'key', 'enabled', 'previous_value', 'changed_reason', 'changed_by',
        'changed_at', 'expires_at', 'restore_value',
    ];

    protected function casts(): array
    {
        return [
            'enabled'        => 'boolean',
            'previous_value' => 'boolean',
            'restore_value'  => 'boolean',
            'changed_at'     => 'datetime',
            'expires_at'     => 'datetime',
        ];
    }

    public function changedBy()
    {
        return $this->belongsTo(User::class, 'changed_by');
    }
}
