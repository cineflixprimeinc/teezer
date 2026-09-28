<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Presentation and organisation fields for a subscription plan.
 *
 * The redesigned Edit Plan screen offers a plan icon, a category, tags and an
 * internal note. None of them had anywhere to be stored, and the existing page
 * deliberately refused to render inputs for things the backend could not save -
 * "a form that looks editable and saves nothing is worse than no form". These
 * columns are what let that screen be built without breaking that rule.
 *
 * All nullable with sensible defaults: every existing plan stays valid without a
 * backfill, and a plan that never sets them renders exactly as it does today.
 *
 * `theme` is widened from light|dark to include gradient and brand. It is stored
 * as a plain string and validated in the controller rather than by a CHECK
 * constraint, so adding a fifth theme later is a one-line change and not a
 * migration on a live table.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subscription_plans', function (Blueprint $table) {
            // Stored path on the media disk, not a URL - the controller turns it
            // into one, the same way avatars are handled.
            $table->string('icon_path', 255)->nullable()->after('theme');

            // Groups plans in the admin list. Free text with a validated set in
            // the controller.
            $table->string('category', 40)->nullable()->after('icon_path');

            // Admin-facing labels for filtering. JSON rather than a join table:
            // they are a handful of strings per plan, never queried across
            // plans, and a table would be three joins for a chip row.
            $table->json('tags')->nullable()->after('category');

            // Never shown to customers. Explicitly not `tagline`, which is.
            $table->text('internal_note')->nullable()->after('tags');
        });
    }

    public function down(): void
    {
        Schema::table('subscription_plans', function (Blueprint $table) {
            $table->dropColumn(['icon_path', 'category', 'tags', 'internal_note']);
        });
    }
};
