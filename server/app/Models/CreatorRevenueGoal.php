<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CreatorRevenueGoal extends Model
{
    protected $fillable = ['user_id', 'monthly_goal', 'currency'];

    protected function casts(): array
    {
        return ['monthly_goal' => 'decimal:2'];
    }

    public function user() { return $this->belongsTo(User::class); }
}
