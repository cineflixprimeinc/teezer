<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

class AppSetting extends Model
{
    protected $fillable = ['key', 'value', 'type', 'group', 'description', 'is_public'];

    protected function casts(): array
    {
        return ['is_public' => 'boolean'];
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        return Cache::remember("app_setting:{$key}", 3600, function () use ($key, $default) {
            $setting = static::where('key', $key)->first();
            if (!$setting) return $default;
            return match($setting->type) {
                'boolean' => (bool) $setting->value,
                'integer' => (int)  $setting->value,
                'json'    => json_decode($setting->value, true),
                default   => $setting->value,
            };
        });
    }

    public static function set(string $key, mixed $value, string $type = 'string'): void
    {
        $encoded = is_array($value) ? json_encode($value) : (string) $value;
        static::updateOrCreate(['key' => $key], ['value' => $encoded, 'type' => $type]);
        Cache::forget("app_setting:{$key}");
    }

    public static function publicSettings(): array
    {
        return Cache::remember('app_settings_public', 3600, function () {
            return static::where('is_public', true)->pluck('value', 'key')->toArray();
        });
    }
}
