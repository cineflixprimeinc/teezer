<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('comment_reactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('comment_id')->constrained('video_comments')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->enum('reaction_type', ['love', 'dislike']);
            $table->timestamps();
            $table->unique(['comment_id', 'user_id']);
            $table->index(['comment_id', 'reaction_type']);
        });

        // Migrate existing likes as 'love' reactions
        DB::table('comment_likes')->orderBy('id')->chunk(500, function ($likes) {
            $rows = [];
            foreach ($likes as $like) {
                $rows[] = [
                    'comment_id'    => $like->comment_id,
                    'user_id'       => $like->user_id,
                    'reaction_type' => 'love',
                    'created_at'    => $like->created_at ?? now(),
                    'updated_at'    => $like->created_at ?? now(),
                ];
            }
            if ($rows) {
                DB::table('comment_reactions')->insertOrIgnore($rows);
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('comment_reactions');
    }
};
