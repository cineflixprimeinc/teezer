<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Creates (or resets) the read-only demo administrator.
 *
 * A command rather than a seeder or a migration, for two reasons: the password
 * is supplied at run time so it never enters the repository or Git history, and
 * resetting the account after someone has poked at a demo is a routine
 * operation rather than a schema change.
 *
 * The account it creates is a normal admin in every respect except the is_demo
 * flag, which BlockDemoWrites uses to refuse every non-GET request inside the
 * admin panel. It can sign in on the website, see "Admin Panel" in the profile
 * dropdown, and browse the whole panel - it just cannot save anything.
 */
class CreateDemoAdmin extends Command
{
    protected $signature = 'admin:demo
                            {--email= : Email for the demo account}
                            {--password= : Password (prompted if omitted, never echoed)}
                            {--username= : Username, derived from the email when omitted}
                            {--name=Demo Admin : Display name}
                            {--revoke-tokens : Sign the demo account out everywhere}';

    protected $description = 'Create or reset the read-only demo administrator';

    public function handle(): int
    {
        $email = trim((string) ($this->option('email') ?: $this->ask('Email')));

        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->error('That is not a valid email address.');

            return self::FAILURE;
        }

        // secret() so it is not echoed, and not a command argument so it does
        // not land in the shell history of whoever runs this.
        $password = (string) ($this->option('password') ?: $this->secret('Password'));

        if (strlen($password) < 8) {
            $this->error('Password must be at least 8 characters.');

            return self::FAILURE;
        }

        $username = trim((string) ($this->option('username') ?: Str::slug(Str::before($email, '@'), '_')));

        $existing = User::where('email', $email)->first();

        // A username collision with a DIFFERENT account would otherwise fail on
        // the unique index with a raw SQL error.
        $clash = User::where('username', $username)
            ->when($existing, fn ($q) => $q->where('id', '!=', $existing->id))
            ->exists();

        if ($clash) {
            $username .= '_' . Str::lower(Str::random(4));
            $this->warn("Username was taken; using '{$username}' instead.");
        }

        /*
         * Split deliberately. User::$fillable refuses to mass-assign role,
         * is_demo, is_active and is_banned - a guard against a stray
         * update($request->all()) escalating someone to admin - and it throws
         * rather than silently dropping them. forceFill() is the sanctioned way
         * past it, and setting these IS the point of this command, so it is
         * used only for those four and only here.
         */
        $safe = [
            'name'              => (string) $this->option('name'),
            'username'          => $username,
            'password'          => Hash::make($password),
            'email_verified_at' => now(),
        ];

        $privileged = [
            'role'      => 'admin',
            'is_demo'   => true,
            'is_active' => true,
            'is_banned' => false,
        ];

        if ($existing) {
            $user = $existing;
            $user->fill($safe);
            $this->info('Existing account updated and reset to demo mode.');
        } else {
            $user = new User(['email' => $email] + $safe);
            $this->info('Demo administrator created.');
        }

        $user->forceFill($privileged)->save();

        // Any token minted before the reset belonged to the previous password.
        if ($this->option('revoke-tokens')) {
            $count = $user->tokens()->count();
            $user->tokens()->delete();
            $this->line("  Revoked {$count} existing session token(s).");
        }

        /*
         * Log, not AdminActionLog.
         *
         * admin_action_logs.admin_id is NOT NULL with a foreign key to users,
         * so that table cannot represent an action with no admin actor - and a
         * CLI command run by an operator on the server has none. Passing null
         * does not fail cleanly either: record() casts it to (int) 0 and the
         * insert dies on the foreign key, which is how this surfaced.
         *
         * Same precedent as the scheduled countries:sync command, which logs
         * for exactly this reason. The account creation itself has already
         * succeeded by this point; only the record of it lives here.
         */
        Log::warning('Demo administrator provisioned.', [
            // No password, and no email either - this needs to say WHICH
            // account was provisioned, not how to sign in as it.
            'user_id'  => $user->id,
            'username' => $user->username,
            'role'     => $user->role,
            'is_demo'  => true,
        ]);

        $this->newLine();
        $this->line('  Username   ' . $user->username);
        $this->line('  Email      ' . $user->email);
        $this->line('  Role       ' . $user->role . '  (read-only: is_demo = true)');
        $this->line('  User ID    ' . $user->id);
        $this->newLine();
        $this->line('  This account can sign in on the website, see "Admin Panel" in the');
        $this->line('  profile dropdown, and browse every admin page. Every write is refused');
        $this->line('  server-side by BlockDemoWrites, so it cannot save, edit or delete.');
        $this->newLine();
        $this->warn('  To take an account OUT of demo mode: set is_demo = false on that user.');

        return self::SUCCESS;
    }
}
