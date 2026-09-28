<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CreatorProgress extends Model
{
    public $timestamps = false;
    protected $fillable = ['user_id', 'current_level_id', 'current_xp', 'total_xp_earned'];

    public function user()  { return $this->belongsTo(User::class); }
    public function level() { return $this->belongsTo(CreatorLevel::class, 'current_level_id'); }
}
