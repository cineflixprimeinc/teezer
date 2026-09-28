<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_video_preferences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // pref_type: 'hashtag' | 'category' | 'creator'
            $table->enum('pref_type', ['hashtag', 'category', 'creator']);
            $table->string('pref_value', 100); // tag name, category slug, or creator user_id as string
            $table->decimal('weight', 6, 3)->default(1.000); // higher = stronger preference
            $table->unsignedInteger('interaction_count')->default(1);
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

            $table->unique(['user_id', 'pref_type', 'pref_value']);
            $table->index(['user_id', 'pref_type']);
            $table->index(['user_id', 'weight']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_video_preferences');
    }
};
