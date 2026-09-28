<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE notifications ADD COLUMN action_status varchar(20) NULL');
        } else {
            DB::statement("ALTER TABLE notifications ADD COLUMN action_status VARCHAR(20) NULL AFTER is_read");
        }
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE notifications DROP COLUMN action_status");
    }
};
