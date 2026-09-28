<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('country_detections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->char('detected_country_code', 2);
            $table->string('detected_country_name', 100)->nullable();
            $table->unsignedInteger('detected_asn_number')->nullable();
            $table->string('detected_isp_organization', 191)->nullable();
            $table->timestamp('detected_at')->useCurrent();
            $table->char('ip_hash', 64)->nullable(); // SHA-256 hex of "<IP><APP_KEY-salt>"
            $table->enum('source', ['signup', 'login', 'app_open', 'web_open', 'country_change_check']);
            $table->timestamps();

            $table->index(['user_id', 'detected_at']);
            $table->index(['user_id', 'detected_country_code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('country_detections');
    }
};
