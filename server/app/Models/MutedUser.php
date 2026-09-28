<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MutedUser extends Model
{
    protected $table = 'muted_users';

    protected $fillable = ['muter_id', 'muted_id'];

    public $timestamps = false;

    protected function casts(): array
    {
        return ['created_at' => 'datetime'];
    }

    public function muter()
    {
        return $this->belongsTo(User::class, 'muter_id');
    }

    public function muted()
    {
        return $this->belongsTo(User::class, 'muted_id');
    }
}
