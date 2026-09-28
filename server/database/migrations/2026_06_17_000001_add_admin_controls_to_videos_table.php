<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            if (! Schema::hasColumn('videos', 'allow_replies')) {
                $table->boolean('allow_replies')->default(true)->after('allow_download');
            }
            if (! Schema::hasColumn('videos', 'allow_sharing')) {
                $table->boolean('allow_sharing')->default(true)->after('allow_replies');
            }
            if (! Schema::hasColumn('videos', 'allow_embedding')) {
                $table->boolean('allow_embedding')->default(false)->after('allow_sharing');
            }
            if (! Schema::hasColumn('videos', 'show_on_profile')) {
                $table->boolean('show_on_profile')->default(true)->after('allow_embedding');
            }
            if (! Schema::hasColumn('videos', 'age_restriction')) {
                $table->string('age_restriction', 20)->default('everyone')->after('show_on_profile');
            }
            if (! Schema::hasColumn('videos', 'content_label')) {
                $table->string('content_label', 50)->nullable()->after('age_restriction');
            }
            if (! Schema::hasColumn('videos', 'sensitive_warning')) {
                $table->boolean('sensitive_warning')->default(false)->after('content_label');
            }
            if (! Schema::hasColumn('videos', 'notify_followers')) {
                $table->boolean('notify_followers')->default(true)->after('sensitive_warning');
            }
            if (! Schema::hasColumn('videos', 'send_push_after_publish')) {
                $table->boolean('send_push_after_publish')->default(true)->after('notify_followers');
            }
            if (! Schema::hasColumn('videos', 'recommendation_eligible')) {
                $table->boolean('recommendation_eligible')->default(true)->after('send_push_after_publish');
            }
            if (! Schema::hasColumn('videos', 'search_indexing')) {
                $table->boolean('search_indexing')->default(true)->after('recommendation_eligible');
            }
            if (! Schema::hasColumn('videos', 'region_allowed')) {
                $table->json('region_allowed')->nullable()->after('search_indexing');
            }
            if (! Schema::hasColumn('videos', 'region_blocked')) {
                $table->json('region_blocked')->nullable()->after('region_allowed');
            }
            if (! Schema::hasColumn('videos', 'shadowban_enabled')) {
                $table->boolean('shadowban_enabled')->default(false)->after('region_blocked');
            }
            if (! Schema::hasColumn('videos', 'limited_distribution')) {
                $table->boolean('limited_distribution')->default(false)->after('shadowban_enabled');
            }
            if (! Schema::hasColumn('videos', 'limited_reason')) {
                $table->text('limited_reason')->nullable()->after('limited_distribution');
            }
            if (! Schema::hasColumn('videos', 'review_priority')) {
                $table->string('review_priority', 20)->default('normal')->after('limited_reason');
            }
            if (! Schema::hasColumn('videos', 'copyright_match_status')) {
                $table->string('copyright_match_status', 50)->nullable()->after('review_priority');
            }
            if (! Schema::hasColumn('videos', 'duplicate_match_status')) {
                $table->string('duplicate_match_status', 50)->nullable()->after('copyright_match_status');
            }
            if (! Schema::hasColumn('videos', 'content_fingerprint')) {
                $table->string('content_fingerprint', 255)->nullable()->after('duplicate_match_status');
            }
            if (! Schema::hasColumn('videos', 'legal_hold')) {
                $table->boolean('legal_hold')->default(false)->after('content_fingerprint');
            }
            if (! Schema::hasColumn('videos', 'reporting_sensitivity')) {
                $table->string('reporting_sensitivity', 20)->default('standard')->after('legal_hold');
            }
            if (! Schema::hasColumn('videos', 'archive_status')) {
                $table->string('archive_status', 20)->default('active')->after('reporting_sensitivity');
            }
            if (! Schema::hasColumn('videos', 'auto_archive_after')) {
                $table->string('auto_archive_after', 30)->default('never')->after('archive_status');
            }
            if (! Schema::hasColumn('videos', 'captions_file_url')) {
                $table->string('captions_file_url')->nullable()->after('auto_archive_after');
            }
            if (! Schema::hasColumn('videos', 'admin_notes')) {
                $table->text('admin_notes')->nullable()->after('captions_file_url');
            }
            if (! Schema::hasColumn('videos', 'audit_notes')) {
                $table->text('audit_notes')->nullable()->after('admin_notes');
            }
        });
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $cols = [
                'allow_replies', 'allow_sharing', 'allow_embedding', 'show_on_profile',
                'age_restriction', 'content_label', 'sensitive_warning',
                'notify_followers', 'send_push_after_publish',
                'recommendation_eligible', 'search_indexing',
                'region_allowed', 'region_blocked',
                'shadowban_enabled', 'limited_distribution', 'limited_reason',
                'review_priority', 'copyright_match_status', 'duplicate_match_status',
                'content_fingerprint', 'legal_hold', 'reporting_sensitivity',
                'archive_status', 'auto_archive_after', 'captions_file_url',
                'admin_notes', 'audit_notes',
            ];
            $table->dropColumn(array_filter($cols, fn ($c) => Schema::hasColumn('videos', $c)));
        });
    }
};
