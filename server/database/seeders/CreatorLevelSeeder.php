<?php

namespace Database\Seeders;

use App\Models\CreatorLevel;
use Illuminate\Database\Seeder;

class CreatorLevelSeeder extends Seeder
{
    public function run(): void
    {
        $levels = [
            [
                'id'          => 1,
                'level_name'  => 'Rising Star',
                'min_xp'      => 0,
                'max_xp'      => 999,
                'badge_color' => '#9e9e9e',
                'icon_url'    => null,
                'perks'       => ['basic_analytics'],
            ],
            [
                'id'          => 2,
                'level_name'  => 'Creator',
                'min_xp'      => 1000,
                'max_xp'      => 4999,
                'badge_color' => '#4caf50',
                'icon_url'    => null,
                'perks'       => ['basic_analytics', 'custom_thumbnail'],
            ],
            [
                'id'          => 3,
                'level_name'  => 'Pro Creator',
                'min_xp'      => 5000,
                'max_xp'      => 19999,
                'badge_color' => '#2196f3',
                'icon_url'    => null,
                'perks'       => ['basic_analytics', 'custom_thumbnail', 'monetization', 'gifts'],
            ],
            [
                'id'          => 4,
                'level_name'  => 'Star Creator',
                'min_xp'      => 20000,
                'max_xp'      => 99999,
                'badge_color' => '#fe2c55',
                'icon_url'    => null,
                'perks'       => ['basic_analytics', 'custom_thumbnail', 'monetization', 'gifts', 'priority_support', 'advanced_analytics'],
            ],
            [
                'id'          => 5,
                'level_name'  => 'Elite Creator',
                'min_xp'      => 100000,
                'max_xp'      => null,
                'badge_color' => '#ffd700',
                'icon_url'    => null,
                'perks'       => ['basic_analytics', 'custom_thumbnail', 'monetization', 'gifts', 'priority_support', 'advanced_analytics', 'verified_badge', 'exclusive_features'],
            ],
        ];

        foreach ($levels as $level) {
            CreatorLevel::updateOrCreate(['id' => $level['id']], $level);
        }
    }
}
