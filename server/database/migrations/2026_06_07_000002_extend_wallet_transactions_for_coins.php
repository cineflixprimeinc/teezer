<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Change type column from ENUM to VARCHAR so we can add more types.
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check');
            DB::statement('ALTER TABLE wallet_transactions ALTER COLUMN "type" TYPE varchar(50)');
            DB::statement("ALTER TABLE wallet_transactions ALTER COLUMN \"type\" SET DEFAULT 'credit'");
        } else {
            DB::statement("ALTER TABLE wallet_transactions MODIFY COLUMN `type` VARCHAR(50) NOT NULL DEFAULT 'credit'");
        }

        Schema::table('wallet_transactions', function (Blueprint $table) {
            $table->bigInteger('gross_coins')->default(0)->after('amount');
            $table->bigInteger('commission_coins')->default(0)->after('gross_coins');
            $table->bigInteger('net_coins')->default(0)->after('commission_coins');
            $table->bigInteger('balance_after_coins')->default(0)->after('net_coins');
            $table->decimal('wallet_balance_after_usd', 12, 2)->default(0.00)->after('balance_after_coins');
            $table->string('status', 20)->default('completed')->after('wallet_balance_after_usd');
            $table->json('metadata')->nullable()->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('wallet_transactions', function (Blueprint $table) {
            $table->dropColumn([
                'gross_coins', 'commission_coins', 'net_coins',
                'balance_after_coins', 'wallet_balance_after_usd', 'status', 'metadata',
            ]);
        });
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE wallet_transactions ALTER COLUMN "type" TYPE varchar(50)');
            DB::statement("ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
                CHECK (\"type\" IN ('credit','debit','withdrawal','gift_received','subscription_income','ad_income'))");
        } else {
            DB::statement("ALTER TABLE wallet_transactions MODIFY COLUMN `type` ENUM('credit','debit','withdrawal','gift_received','subscription_income','ad_income') NOT NULL");
        }
    }
};
