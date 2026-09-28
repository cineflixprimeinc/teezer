<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('signup_drafts', function (Blueprint $table) {
            $table->id();
            $table->string('draft_token', 64)->unique()->index();
            $table->string('email', 191)->index();
            $table->string('name', 100)->nullable();
            $table->string('username', 50)->nullable();
            $table->date('date_of_birth')->nullable();
            $table->string('country', 100)->nullable();
            $table->string('country_code', 2)->nullable();
            $table->string('otp_hash', 64)->nullable();
            $table->string('link_token_hash', 64)->nullable();
            $table->boolean('email_verified')->default(false);
            $table->timestamp('email_verified_at')->nullable();
            $table->timestamp('expires_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('signup_drafts');
    }
};
