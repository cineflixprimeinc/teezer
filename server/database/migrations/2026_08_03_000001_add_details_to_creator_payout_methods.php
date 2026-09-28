<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Give creator_payout_methods somewhere to keep the details the app actually
 * collects.
 *
 * The table was built read-only around PayPal - provider, account_email,
 * masked_account - and nothing ever wrote a row to it. The app's payout editor
 * collects a different field set per provider (a bank account number, routing
 * number and bank name for Bank Transfer; an email for PayPal/Stripe/Wise), and
 * none of that survives in three columns.
 *
 * `details` is nullable, so every existing row and every existing reader keeps
 * working untouched.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('creator_payout_methods', function (Blueprint $table) {
            // Per-provider fields, exactly as the payout editor collected them.
            $table->json('details')->nullable()->after('masked_account');
        });
    }

    public function down(): void
    {
        Schema::table('creator_payout_methods', function (Blueprint $table) {
            $table->dropColumn('details');
        });
    }
};
