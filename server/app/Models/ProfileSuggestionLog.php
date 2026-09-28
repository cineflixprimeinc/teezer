<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProfileSuggestionLog extends Model
{
    public $timestamps  = false;
    public $primaryKey  = 'id';

    protected $fillable = [
        'user_id', 'suggested_user_id', 'context',
        'score', 'reason', 'shown_at', 'clicked_at', 'followed_at',
    ];

    protected function casts(): array
    {
        return [
            'shown_at'   => 'datetime',
            'clicked_at' => 'datetime',
            'followed_at'=> 'datetime',
            'score'      => 'float',
        ];
    }

    public function user()          { return $this->belongsTo(User::class); }
    public function suggestedUser() { return $this->belongsTo(User::class, 'suggested_user_id'); }
}
