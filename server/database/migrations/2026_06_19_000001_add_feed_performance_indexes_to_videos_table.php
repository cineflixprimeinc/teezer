<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            // Composite index for the main feed query filter:
            // WHERE status = 'published' AND deleted_at IS NULL ORDER BY created_at DESC
            if (!$this->indexExists('videos', 'videos_status_deleted_at_created_at_index')) {
                $table->index(['status', 'deleted_at', 'created_at'], 'videos_status_deleted_at_created_at_index');
            }

            // Composite index for per-creator feed queries and profile pages:
            // WHERE user_id = ? AND status = 'published' ORDER BY created_at DESC
            if (!$this->indexExists('videos', 'videos_user_id_status_created_at_index')) {
                $table->index(['user_id', 'status', 'created_at'], 'videos_user_id_status_created_at_index');
            }
        });
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $sm = Schema::getConnection()->getDoctrineSchemaManager();
            $indexes = array_keys($sm->listTableIndexes('videos'));

            if (in_array('videos_status_deleted_at_created_at_index', $indexes)) {
                $table->dropIndex('videos_status_deleted_at_created_at_index');
            }
            if (in_array('videos_user_id_status_created_at_index', $indexes)) {
                $table->dropIndex('videos_user_id_status_created_at_index');
            }
        });
    }

    private function indexExists(string $table, string $index): bool
    {
        try {
            $sm      = Schema::getConnection()->getDoctrineSchemaManager();
            $indexes = array_keys($sm->listTableIndexes($table));
            return in_array($index, $indexes);
        } catch (\Throwable) {
            return false;
        }
    }
};
