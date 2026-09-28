<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_admin_restrictions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->enum('restriction_type', [
                'restrict_uploads',
                'post_approval_required',
                'block_live_access',
                'disable_draft_creation',
                'disable_commenting_on_uploads',
            ]);
            $table->boolean('is_active')->default(false);
            $table->timestamp('expires_at')->nullable();
            $table->string('reason', 500)->nullable();
            $table->foreignId('created_by_admin_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by_admin_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['user_id', 'restriction_type']);
            $table->index('is_active');
            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_admin_restrictions');
    }
};
