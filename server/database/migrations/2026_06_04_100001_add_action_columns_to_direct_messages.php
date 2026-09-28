<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('direct_messages', function (Blueprint $table) {
            $table->unsignedBigInteger('reply_to_message_id')->nullable()->after('body');
            $table->timestamp('edited_at')->nullable()->after('read_at');
            $table->boolean('is_pinned')->default(false)->after('edited_at');
            $table->timestamp('pinned_at')->nullable()->after('is_pinned');
            $table->unsignedBigInteger('pinned_by_user_id')->nullable()->after('pinned_at');
            $table->timestamp('deleted_for_everyone_at')->nullable()->after('pinned_by_user_id');
            $table->unsignedBigInteger('deleted_by_user_id')->nullable()->after('deleted_for_everyone_at');
            $table->json('deleted_for_user_ids')->nullable()->after('deleted_by_user_id');
        });
    }

    public function down(): void
    {
        Schema::table('direct_messages', function (Blueprint $table) {
            $table->dropColumn([
                'reply_to_message_id', 'edited_at',
                'is_pinned', 'pinned_at', 'pinned_by_user_id',
                'deleted_for_everyone_at', 'deleted_by_user_id', 'deleted_for_user_ids',
            ]);
        });
    }
};
