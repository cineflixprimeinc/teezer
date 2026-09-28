<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('creator_analytics', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->unsignedBigInteger('views')->default(0);
            $table->unsignedInteger('watch_time_mins')->default(0);
            $table->unsignedInteger('new_followers')->default(0);
            $table->unsignedInteger('lost_followers')->default(0);
            $table->unsignedBigInteger('likes')->default(0);
            $table->unsignedInteger('comments')->default(0);
            $table->unsignedInteger('shares')->default(0);
            $table->unsignedInteger('saves')->default(0);
            $table->decimal('earnings', 10, 2)->default(0.00);

            $table->unique(['user_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('creator_analytics');
    }
};
