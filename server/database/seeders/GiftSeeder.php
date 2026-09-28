<?php

namespace Database\Seeders;

use App\Models\Gift;
use Illuminate\Database\Seeder;

class GiftSeeder extends Seeder
{
    public function run(): void
    {
        $gifts = [
            ['name' => 'Rose',      'coin_value' => 1,   'cash_value' => 0.0010, 'icon_url' => null],
            ['name' => 'Heart',     'coin_value' => 5,   'cash_value' => 0.0050, 'icon_url' => null],
            ['name' => 'Crown',     'coin_value' => 50,  'cash_value' => 0.0500, 'icon_url' => null],
            ['name' => 'Rocket',    'coin_value' => 100, 'cash_value' => 0.1000, 'icon_url' => null],
            ['name' => 'Universe',  'coin_value' => 500, 'cash_value' => 0.5000, 'icon_url' => null],
        ];

        foreach ($gifts as $gift) {
            Gift::firstOrCreate(['name' => $gift['name']], $gift);
        }
    }
}
