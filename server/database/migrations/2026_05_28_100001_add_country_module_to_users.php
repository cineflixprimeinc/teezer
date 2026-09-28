<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // What the user picked at signup / last approved change.
            $table->char('selected_country_code', 2)->nullable()->after('country');
            $table->string('selected_country_name', 100)->nullable()->after('selected_country_code');

            // Last detection result (refreshed on signup, login, heartbeat).
            $table->char('detected_country_code', 2)->nullable()->after('selected_country_name');
            $table->string('detected_country_name', 100)->nullable()->after('detected_country_code');
            $table->unsignedInteger('detected_asn_number')->nullable()->after('detected_country_name');
            $table->string('detected_isp_organization', 191)->nullable()->after('detected_asn_number');

            // 60-day lock + change tracking.
            $table->timestamp('country_locked_until')->nullable()->after('detected_isp_organization');
            $table->timestamp('country_last_changed_at')->nullable()->after('country_locked_until');
            $table->timestamp('country_change_eligible_at')->nullable()->after('country_last_changed_at');
            $table->enum('country_change_status', ['none', 'pending', 'eligible', 'approved', 'rejected', 'cancelled'])
                ->default('none')->after('country_change_eligible_at');

            // Admin override metadata (last override).
            $table->boolean('admin_country_override')->default(false)->after('country_change_status');
            $table->unsignedBigInteger('admin_country_override_by')->nullable()->after('admin_country_override');
            $table->timestamp('admin_country_override_at')->nullable()->after('admin_country_override_by');
            $table->string('admin_country_override_reason', 500)->nullable()->after('admin_country_override_at');

            $table->index('selected_country_code');
            $table->index('detected_country_code');
            $table->index('country_locked_until');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['selected_country_code']);
            $table->dropIndex(['detected_country_code']);
            $table->dropIndex(['country_locked_until']);
            $table->dropColumn([
                'selected_country_code', 'selected_country_name',
                'detected_country_code', 'detected_country_name',
                'detected_asn_number', 'detected_isp_organization',
                'country_locked_until', 'country_last_changed_at',
                'country_change_eligible_at', 'country_change_status',
                'admin_country_override', 'admin_country_override_by',
                'admin_country_override_at', 'admin_country_override_reason',
            ]);
        });
    }
};
