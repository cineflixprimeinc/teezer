<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CreatorApplication extends Model
{
    protected $fillable = ['user_id', 'status', 'rejection_reason', 'applied_at', 'reviewed_at', 'reviewed_by'];

    protected function casts(): array
    {
        return [
            'applied_at'  => 'datetime',
            'reviewed_at' => 'datetime',
        ];
    }

    public function user()     { return $this->belongsTo(User::class); }
    public function reviewer() { return $this->belongsTo(User::class, 'reviewed_by'); }
}
