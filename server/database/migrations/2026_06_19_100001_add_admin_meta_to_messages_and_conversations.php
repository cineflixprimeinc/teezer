<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            $table->timestamp('flagged_at')->nullable()->after('approved_at');
            $table->string('report_status', 20)->nullable()->after('flagged_at');  // open | reviewed | closed
            $table->string('risk_level', 10)->nullable()->after('report_status');  // low | medium | high
            $table->boolean('shadow_restricted')->default(false)->after('risk_level');
            $table->boolean('dm_restricted')->default(false)->after('shadow_restricted');
            $table->boolean('message_approval_required')->default(false)->after('dm_restricted');
            $table->boolean('links_disabled')->default(false)->after('message_approval_required');
            $table->boolean('media_restricted')->default(false)->after('links_disabled');
            $table->boolean('prevent_new_requests')->default(false)->after('media_restricted');
            $table->boolean('auto_hide_reported')->default(false)->after('prevent_new_requests');
            $table->boolean('history_archived')->default(false)->after('auto_hide_reported');
            $table->string('auto_delete_flagged', 20)->nullable()->after('history_archived'); // never | 7d | 30d | 90d
            $table->timestamp('admin_closed_at')->nullable()->after('auto_delete_flagged');
            $table->timestamp('admin_muted_at')->nullable()->after('admin_closed_at');
        });

        Schema::table('direct_messages', function (Blueprint $table) {
            $table->boolean('flagged_by_admin')->default(false)->after('is_pinned');
            $table->timestamp('admin_flagged_at')->nullable()->after('flagged_by_admin');
        });

        Schema::create('conversation_admin_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('conversation_id');
            $table->unsignedBigInteger('admin_id')->nullable();
            $table->string('action', 60);          // message_deleted, user_warned, dm_restricted, flagged, etc.
            $table->string('actor_label', 100)->nullable(); // "Teezer Admin" or username
            $table->json('metadata')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->foreign('conversation_id')->references('id')->on('conversations')->cascadeOnDelete();
            $table->index('conversation_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('conversation_admin_logs');

        Schema::table('direct_messages', function (Blueprint $table) {
            $table->dropColumn(['flagged_by_admin', 'admin_flagged_at']);
        });

        Schema::table('conversations', function (Blueprint $table) {
            $table->dropColumn([
                'flagged_at', 'report_status', 'risk_level',
                'shadow_restricted', 'dm_restricted', 'message_approval_required',
                'links_disabled', 'media_restricted', 'prevent_new_requests',
                'auto_hide_reported', 'history_archived', 'auto_delete_flagged',
                'admin_closed_at', 'admin_muted_at',
            ]);
        });
    }
};
