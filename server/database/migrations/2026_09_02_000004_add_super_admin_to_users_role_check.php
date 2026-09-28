<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Adds 'super_admin' to users.role's CHECK constraint.
 *
 * AdminPermissionController (grant/revoke fine-grained admin permissions,
 * built earlier this session) has always gated on
 * $request->user()->role === 'super_admin' - but that value was never
 * actually permitted by the database. Discovered live: promoting the one
 * real admin account failed with "new row for relation users violates
 * check constraint users_role_check", whose live definition only allowed
 * 'user' | 'creator' | 'admin'. Without this, the admin-permission grant
 * UI has been permanently unusable by anyone, on every environment - not
 * "nobody happened to be granted it yet".
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check');
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK ((role)::text = ANY ((ARRAY['user'::character varying, 'creator'::character varying, 'admin'::character varying, 'super_admin'::character varying])::text[]))");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check');
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK ((role)::text = ANY ((ARRAY['user'::character varying, 'creator'::character varying, 'admin'::character varying])::text[]))");
    }
};
