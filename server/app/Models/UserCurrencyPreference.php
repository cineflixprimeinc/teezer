<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A user's chosen country / currency / language.
 *
 * `auto_detect` is the point of the record: while true, detection decides.
 * Once the user picks something it goes false and the stored values win until
 * they turn detection back on - otherwise the next request from a VPN or a
 * flight would silently undo a deliberate choice.
 */
class UserCurrencyPreference extends Model
{
    protected $fillable = ['user_id', 'country_code', 'currency_code', 'language', 'auto_detect'];

    protected function casts(): array
    {
        return ['auto_detect' => 'boolean'];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
