<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CountryAdminOverrideLog extends Model
{
    protected $fillable = [
        'user_id',
        'old_country_code',
        'old_country_name',
        'new_country_code',
        'new_country_name',
        'admin_id',
        'reason',
        'lock_mode',
        'changed_at',
    ];

    protected $casts = [
        'changed_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function admin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'admin_id');
    }
}
