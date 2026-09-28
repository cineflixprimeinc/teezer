<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            if (! Schema::hasColumn('videos', 'is_ai_generated')) {
                $table->boolean('is_ai_generated')->default(false)->after('is_pinned');
            }
        });
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            if (Schema::hasColumn('videos', 'is_ai_generated')) {
                $table->dropColumn('is_ai_generated');
            }
        });
    }
};
