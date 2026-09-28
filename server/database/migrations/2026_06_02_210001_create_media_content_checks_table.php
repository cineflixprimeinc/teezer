<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('media_content_checks')) {
            Schema::create('media_content_checks', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->unsignedBigInteger('media_id')->nullable();
                $table->foreignId('video_id')->nullable()->constrained('videos')->nullOnDelete();
                $table->string('upload_id')->nullable()->index();
                $table->string('media_type', 30);
                $table->enum('status', ['pending', 'checking', 'passed', 'failed'])->default('pending');
                $table->decimal('nudity_score', 6, 4)->nullable();
                $table->decimal('violence_score', 6, 4)->nullable();
                $table->decimal('quality_score', 6, 4)->nullable();
                $table->text('reason')->nullable();
                $table->json('details')->nullable();
                $table->timestamp('checked_at')->nullable();
                $table->timestamps();

                $table->index(['user_id', 'status']);
                $table->index(['video_id', 'status']);
            });
        }

        Schema::table('videos', function (Blueprint $table) {
            if (! Schema::hasColumn('videos', 'content_check_status')) {
                $table->string('content_check_status', 20)->default('pending')->after('moderation_status')->index();
            }

            if (! Schema::hasColumn('videos', 'content_check_passed')) {
                $table->boolean('content_check_passed')->default(false)->after('content_check_status');
            }

            if (! Schema::hasColumn('videos', 'content_check_reason')) {
                $table->text('content_check_reason')->nullable()->after('content_check_passed');
            }
        });
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            if (Schema::hasColumn('videos', 'content_check_status')) {
                $table->dropIndex(['content_check_status']);
            }

            foreach (['content_check_status', 'content_check_passed', 'content_check_reason'] as $column) {
                if (Schema::hasColumn('videos', $column)) {
                    $table->dropColumn($column);
                }
            }
        });

        Schema::dropIfExists('media_content_checks');
    }
};
