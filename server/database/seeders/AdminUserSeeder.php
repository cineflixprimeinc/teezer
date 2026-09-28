<?php

namespace Database\Seeders;

use App\Models\Profile;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        $email    = env('ADMIN_EMAIL', 'admin@teezer.live');
        $password = env('ADMIN_PASSWORD');

        // The fallback password this seeder used to carry is committed to a
        // repository that has been pushed to GitHub, so it is public knowledge.
        // Seeding production with it would hand anyone who reads the repo an
        // admin login on a known address. In production the password must be
        // supplied explicitly; local and CI keep a convenient default.
        if (app()->environment('production') && blank($password)) {
            throw new \RuntimeException(
                'AdminUserSeeder: ADMIN_PASSWORD must be set in production. '
                . 'Refusing to seed an admin account with the built-in default password.'
            );
        }

        $existing = User::where('email', $email)->first();

        // Only ever write a password on CREATE. This seeder is idempotent and
        // gets re-run by deploy scripts, and updateOrCreate() would silently
        // reset a rotated admin password back to whatever ADMIN_PASSWORD (or
        // the default) happens to be - turning a routine re-seed into a
        // credential rollback nobody asked for.
        if ($existing !== null) {
            $existing->fill([
                'name'              => 'Teezer Admin',
                'username'          => 'teezer_admin',
                'role'              => 'admin',
                'is_verified'       => true,
                'email_verified_at' => $existing->email_verified_at ?? now(),
            ])->save();

            Profile::firstOrCreate(['user_id' => $existing->id]);

            return;
        }

        $user = User::create([
            'email'             => $email,
            'name'              => 'Teezer Admin',
            'username'          => 'teezer_admin',
            'password'          => Hash::make($password ?? 'ChangeMe@2025!'),
            'role'              => 'admin',
            'is_verified'       => true,
            'email_verified_at' => now(),
        ]);

        Profile::firstOrCreate(['user_id' => $user->id]);
    }
}
