<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CreatorLevel extends Model
{
    public $timestamps = false;
    protected $primaryKey = 'id';
    public $incrementing = false;

    protected $fillable = ['id', 'level_name', 'min_xp', 'max_xp', 'badge_color', 'icon_url', 'perks'];

    protected function casts(): array
    {
        return ['perks' => 'array'];
    }
}
