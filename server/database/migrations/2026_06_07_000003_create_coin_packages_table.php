<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('coin_packages', function (Blueprint $table) {
            $table->id();
            $table->string('plan_name', 100);
            $table->bigInteger('coins');
            $table->decimal('price_usd', 10, 2);
            $table->string('badge', 50)->nullable();
            $table->string('icon', 100)->nullable();
            $table->boolean('is_front_visible')->default(false);
            $table->boolean('is_active')->default(true);
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->index(['is_active', 'sort_order']);
            $table->index('is_front_visible');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('coin_packages');
    }
};
