<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admin_commissions', function (Blueprint $table) {
            $table->id();
            $table->string('source_type', 50)->default('gift');
            $table->unsignedBigInteger('source_id');
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->bigInteger('gross_coins');
            $table->decimal('commission_rate', 5, 2)->default(30.00);
            $table->bigInteger('commission_coins');
            $table->decimal('commission_value_usd', 10, 2);
            $table->timestamps();

            $table->index(['source_type', 'source_id']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_commissions');
    }
};
