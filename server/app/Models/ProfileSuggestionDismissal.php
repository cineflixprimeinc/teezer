<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProfileSuggestionDismissal extends Model
{
    public $timestamps = false;

    protected $fillable = ['user_id', 'suggested_user_id', 'dismissed_at'];

    protected function casts(): array
    {
        return ['dismissed_at' => 'datetime'];
    }

    public function user()          { return $this->belongsTo(User::class); }
    public function suggestedUser() { return $this->belongsTo(User::class, 'suggested_user_id'); }
}
