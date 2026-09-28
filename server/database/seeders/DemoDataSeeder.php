<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Profile;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DemoDataSeeder extends Seeder
{
    public function run(): void
    {
        // Only run in local/development environments
        if (! app()->isLocal()) {
            $this->command->warn('DemoDataSeeder skipped - not in local environment.');
            return;
        }

        $users = [
            ['name' => 'Demo Creator',  'username' => 'demo_creator',  'role' => 'creator'],
            ['name' => 'Demo User',     'username' => 'demo_user',     'role' => 'user'],
        ];

        foreach ($users as $data) {
            $user = User::updateOrCreate(
                ['username' => $data['username']],
                [
                    'name'              => $data['name'],
                    'email'             => $data['username'] . '@demo.teezer.live',
                    'password'          => Hash::make('Demo@2025!'),
                    'role'              => $data['role'],
                    'email_verified_at' => now(),
                ]
            );

            Profile::firstOrCreate(['user_id' => $user->id]);
        }
    }
}
