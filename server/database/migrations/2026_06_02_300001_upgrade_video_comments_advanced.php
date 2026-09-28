<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('video_comments', function (Blueprint $table) {
            $table->unsignedTinyInteger('comment_rank')->nullable()->after('body');
            $table->unsignedInteger('dislike_count')->default(0)->after('likes_count');
            $table->unsignedInteger('reply_count')->default(0)->after('dislike_count');
            $table->integer('reaction_score')->default(0)->after('reply_count');
            $table->unsignedInteger('pin_order')->nullable()->after('is_pinned');
            $table->timestamp('pinned_at')->nullable()->after('pin_order');
            $table->foreignId('pinned_by')->nullable()->constrained('users')->nullOnDelete()->after('pinned_at');
            $table->boolean('is_edited')->default(false)->after('pinned_by');
            $table->timestamp('edited_at')->nullable()->after('is_edited');
        });
    }

    public function down(): void
    {
        Schema::table('video_comments', function (Blueprint $table) {
            $table->dropForeign(['pinned_by']);
            $table->dropColumn([
                'comment_rank', 'dislike_count', 'reply_count', 'reaction_score',
                'pin_order', 'pinned_at', 'pinned_by', 'is_edited', 'edited_at',
            ]);
        });
    }
};
