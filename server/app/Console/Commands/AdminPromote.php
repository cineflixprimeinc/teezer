<?php

namespace App\Console\Commands;

use App\Models\AdminPermission;
use App\Models\User;
use App\Support\AdminPermissions;
use Illuminate\Console\Command;

/**
 * Support/bootstrap tool: promote an EXISTING admin account to super_admin
 * and/or grant it fine-grained permissions (see App\Support\AdminPermissions
 * for the catalog). Deliberately refuses to touch a non-admin account - this
 * promotes an already-admin user, it never creates admin access from
 * scratch. Idempotent - safe to re-run.
 *
 * Exists because granting permission/AdminPermission::firstOrCreate() by
 * hand via `tinker` for a production account is exactly the kind of ad-hoc
 * write this command replaces with something reviewable, named, and
 * argument-validated instead.
 *
 * Usage:
 *   php artisan admin:promote support@teezer.live --super-admin
 *   php artisan admin:promote support@teezer.live --permission=manage_country_availability
 *   php artisan admin:promote support@teezer.live --super-admin --permission=manage_country_availability
 */
class AdminPromote extends Command
{
    protected $signature = 'admin:promote
        {email : the account\'s email address}
        {--super-admin : set role=super_admin (only if not already)}
        {--permission=* : one or more fine-grained permissions to grant, e.g. manage_country_availability}';

    protected $description = 'Promote an existing admin account to super_admin and/or grant fine-grained permissions';

    public function handle(): int
    {
        $email = trim((string) $this->argument('email'));
        $user = User::where('email', $email)->first();

        if (!$user) {
            $this->error("No user found with email \"{$email}\".");
            return self::FAILURE;
        }

        if (!in_array($user->role, ['admin', 'super_admin'], true)) {
            $this->error(
                "User \"{$email}\" has role \"{$user->role}\", not admin/super_admin - " .
                'refusing to promote a non-admin account. Grant baseline admin access through the normal path first.',
            );
            return self::FAILURE;
        }

        $permissions = $this->option('permission');
        foreach ($permissions as $permission) {
            if (!AdminPermissions::isValid($permission)) {
                $this->error("Unknown permission \"{$permission}\" - not in App\\Support\\AdminPermissions::catalog().");
                return self::FAILURE;
            }
        }

        $this->info("Before: id={$user->id} email={$user->email} role={$user->role}");

        if ($this->option('super-admin') && $user->role !== 'super_admin') {
            $user->role = 'super_admin';
            $user->save();
        }

        foreach ($permissions as $permission) {
            AdminPermission::firstOrCreate(['user_id' => $user->id, 'permission' => $permission]);
        }

        $user->refresh();
        $this->info("After:  id={$user->id} email={$user->email} role={$user->role}");
        foreach ($permissions as $permission) {
            $this->line("  permission \"{$permission}\": " . ($user->hasAdminGrant($permission) ? 'granted' : 'FAILED TO GRANT'));
        }

        return self::SUCCESS;
    }
}
