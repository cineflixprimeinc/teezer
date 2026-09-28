<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserVideoPreference extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'user_id', 'pref_type', 'pref_value', 'weight', 'interaction_count',
    ];

    protected function casts(): array
    {
        return [
            'weight'            => 'float',
            'interaction_count' => 'integer',
            'updated_at'        => 'datetime',
        ];
    }

    public function user() { return $this->belongsTo(User::class); }

    /**
     * Increment or create a preference row for a given type/value.
     * Positive delta = boost (like, save, watch). Negative = suppress (skip).
     */
    public static function adjust(int $userId, string $type, string $value, float $delta): void
    {
        static::upsert(
            [[
                'user_id'           => $userId,
                'pref_type'         => $type,
                'pref_value'        => $value,
                'weight'            => max(0, $delta),
                'interaction_count' => 1,
                'updated_at'        => now(),
            ]],
            ['user_id', 'pref_type', 'pref_value'],
            // On duplicate: increment weight and interaction_count
        );

        // Use raw update for increment to avoid race conditions
        static::where('user_id', $userId)
            ->where('pref_type', $type)
            ->where('pref_value', $value)
            ->update([
                'weight'            => \Illuminate\Support\Facades\DB::raw("GREATEST(0, LEAST(100, weight + {$delta}))"),
                'interaction_count' => \Illuminate\Support\Facades\DB::raw('interaction_count + 1'),
                'updated_at'        => now(),
            ]);
    }
}
