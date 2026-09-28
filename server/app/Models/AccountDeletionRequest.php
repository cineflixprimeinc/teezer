<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AccountDeletionRequest extends Model
{
    protected $fillable = ['user_id', 'reason', 'status', 'scheduled_at'];

    protected $casts = ['scheduled_at' => 'datetime'];

    public function user() { return $this->belongsTo(User::class); }
}
