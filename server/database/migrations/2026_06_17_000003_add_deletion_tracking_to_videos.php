<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            if (! Schema::hasColumn('videos', 'previous_status')) {
                $table->string('previous_status', 30)->nullable()->after('status');
            }
            if (! Schema::hasColumn('videos', 'deleted_by_user_id')) {
                $table->unsignedBigInteger('deleted_by_user_id')->nullable()->after('previous_status');
                $table->foreign('deleted_by_user_id')->references('id')->on('users')->nullOnDelete();
            }
            if (! Schema::hasColumn('videos', 'deleted_by_admin_id')) {
                $table->unsignedBigInteger('deleted_by_admin_id')->nullable()->after('deleted_by_user_id');
                $table->foreign('deleted_by_admin_id')->references('id')->on('users')->nullOnDelete();
            }
            if (! Schema::hasColumn('videos', 'deletion_reason')) {
                $table->text('deletion_reason')->nullable()->after('deleted_by_admin_id');
            }
            if (! Schema::hasColumn('videos', 'restored_at')) {
                $table->timestamp('restored_at')->nullable()->after('deletion_reason');
            }
            if (! Schema::hasColumn('videos', 'restored_by_admin_id')) {
                $table->unsignedBigInteger('restored_by_admin_id')->nullable()->after('restored_at');
                $table->foreign('restored_by_admin_id')->references('id')->on('users')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->dropForeign(['deleted_by_user_id']);
            $table->dropForeign(['deleted_by_admin_id']);
            $table->dropForeign(['restored_by_admin_id']);
            $table->dropColumn([
                'previous_status', 'deleted_by_user_id', 'deleted_by_admin_id',
                'deletion_reason', 'restored_at', 'restored_by_admin_id',
            ]);
        });
    }
};
