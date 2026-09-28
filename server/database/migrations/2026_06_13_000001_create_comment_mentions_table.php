<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('comment_mentions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mentioned_user_id')
                  ->constrained('users')->cascadeOnDelete();
            $table->foreignId('mentioned_by_user_id')
                  ->constrained('users')->cascadeOnDelete();
            $table->string('source_type', 20); // comment | reply | caption
            $table->unsignedBigInteger('source_id');
            $table->unsignedBigInteger('video_id')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index('mentioned_user_id');
            $table->index(['source_type', 'source_id']);
            // Prevent duplicate mention for same user + source
            $table->unique(
                ['mentioned_user_id', 'source_type', 'source_id'],
                'unique_mention_per_source'
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('comment_mentions');
    }
};
