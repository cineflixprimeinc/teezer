<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // GiftSeeder is intentionally absent: the gift catalog is seeded by the
        // 2026_07_13_000002 migration (200 gifts), and re-running the legacy
        // 5-gift seeder would put retired gifts back into the live catalog.
        $this->call([
            CreatorLevelSeeder::class,
            AdminUserSeeder::class,
            DemoDataSeeder::class,
            VideoAnalyticsSeeder::class,
        ]);
    }
}
