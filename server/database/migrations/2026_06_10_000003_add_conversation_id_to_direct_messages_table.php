<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('direct_messages', function (Blueprint $table) {
            // Nullable: old messages have no conversation record (treated as approved legacy)
            $table->unsignedBigInteger('conversation_id')->nullable()->after('id');
            $table->foreign('conversation_id')->references('id')->on('conversations')->nullOnDelete();
            $table->index('conversation_id');
        });
    }

    public function down(): void
    {
        Schema::table('direct_messages', function (Blueprint $table) {
            $table->dropForeign(['conversation_id']);
            $table->dropIndex(['conversation_id']);
            $table->dropColumn('conversation_id');
        });
    }
};
