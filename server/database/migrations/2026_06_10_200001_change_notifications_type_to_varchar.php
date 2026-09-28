<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Change from restrictive ENUM to VARCHAR so new notification types
        // (follow_request, follow_request_accepted, message_request, etc.) never truncate.
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check');
            DB::statement('ALTER TABLE notifications ALTER COLUMN type TYPE varchar(100)');
        } else {
            DB::statement("ALTER TABLE notifications MODIFY COLUMN type VARCHAR(100) NOT NULL");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
                'like','comment','follow','mention','system','gift','verification',
                'report_actioned','follow_request','follow_request_accepted',
                'message_request','message_request_accepted'))");
        } else {
            DB::statement("ALTER TABLE notifications MODIFY COLUMN type ENUM(
                'like','comment','follow','mention','system','gift','verification',
                'report_actioned','follow_request','follow_request_accepted',
                'message_request','message_request_accepted'
            ) NOT NULL");
        }
    }
};
