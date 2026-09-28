<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('active_status')->default(true)->after('message_privacy');
            $table->boolean('profile_discovery')->default(true)->after('active_status');
            $table->boolean('show_to_search_engines')->default(false)->after('profile_discovery');
            $table->string('who_can_comment', 20)->default('everyone')->after('show_to_search_engines');
            $table->string('who_can_tag', 20)->default('friends')->after('who_can_comment');
            $table->string('who_can_duet', 20)->default('friends')->after('who_can_tag');
            $table->string('who_can_download', 20)->default('everyone')->after('who_can_duet');
            $table->string('who_can_see_liked', 20)->default('only_me')->after('who_can_download');
            $table->boolean('comment_filter')->default(true)->after('who_can_see_liked');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'active_status', 'profile_discovery', 'show_to_search_engines',
                'who_can_comment', 'who_can_tag', 'who_can_duet',
                'who_can_download', 'who_can_see_liked', 'comment_filter',
            ]);
        });
    }
};
