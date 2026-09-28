<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fine-grained admin permission grants, layered on top of the existing
 * binary `role === 'admin'` gate (ApiAdminMiddleware) rather than replacing
 * it - a row here only ever narrows what an already-admin user can do, it
 * never widens access beyond the existing role check.
 *
 * `super_admin` bypasses this table entirely (see User::hasPermission()) -
 * matches the admin frontend's own existing `super_admin: ["*"]` convention
 * in roles/page.tsx. Permissions themselves are code-defined (see
 * App\Support\AdminPermissions), not stored here - this table only holds
 * WHO has WHICH of those permissions.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admin_permissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('permission', 100);
            $table->foreignId('granted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['user_id', 'permission']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_permissions');
    }
};
