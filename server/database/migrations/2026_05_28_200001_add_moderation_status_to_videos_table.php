<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            // Default 'approved' so all existing videos remain publicly visible
            $table->enum('moderation_status', [
                'pending',
                'scanning',
                'approved',
                'pending_review',
                'rejected',
            ])->default('approved')->after('is_flagged');

            $table->index('moderation_status');
        });
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->dropColumn('moderation_status');
        });
    }
};
