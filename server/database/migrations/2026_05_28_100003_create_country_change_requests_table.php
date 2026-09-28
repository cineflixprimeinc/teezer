<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('country_change_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->char('current_country_code', 2)->nullable();
            $table->char('requested_country_code', 2);
            $table->string('requested_country_name', 100)->nullable();
            $table->enum('status', ['pending', 'eligible', 'approved', 'rejected', 'cancelled'])
                ->default('pending');
            $table->unsignedSmallInteger('continuous_detected_days')->default(0);
            $table->timestamp('verification_started_at')->nullable();
            $table->timestamp('eligible_at')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->string('rejected_reason', 500)->nullable();
            $table->timestamps();

            $table->index(['user_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('country_change_requests');
    }
};
