<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('story_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('story_id')->constrained()->cascadeOnDelete();
            $table->foreignId('reporter_id')->constrained('users')->cascadeOnDelete();
            $table->string('reason', 100)->default('inappropriate');
            $table->enum('status', ['pending', 'reviewed', 'actioned', 'dismissed'])->default('pending');
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['story_id', 'reporter_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('story_reports');
    }
};
