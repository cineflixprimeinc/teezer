<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserPermissionSetting extends Model
{
    protected $fillable = [
        'user_id', 'live_permission', 'duet_permission',
        'download_permission', 'collaboration_permission',
        'messaging_permission', 'access_level',
    ];

    protected $casts = [
        'live_permission'          => 'boolean',
        'duet_permission'          => 'boolean',
        'download_permission'      => 'boolean',
        'collaboration_permission' => 'boolean',
    ];

    public function user() { return $this->belongsTo(User::class); }

    public static function forUser(int $userId): self
    {
        return self::firstOrCreate(['user_id' => $userId]);
    }
}
