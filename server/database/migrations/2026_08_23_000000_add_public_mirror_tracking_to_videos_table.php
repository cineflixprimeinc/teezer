<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Bookkeeping for PublicMediaMirrorService, not a visibility flag - "public" is
 * still computed live from status/moderation_status/deleted_at everywhere (see
 * PublicMediaMirrorService::isPublic()). These two columns exist only so
 * VideoObserver's dispatch of SyncPublicMediaMirror on every unrelated field
 * edit (captions, admin notes, engagement flags) doesn't re-walk and re-copy
 * a video's whole hls/{id}/ prefix every time - the HLS mirror is only
 * re-synced when hls_ready_at has actually moved past what was last mirrored.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->timestamp('public_mirror_synced_at')->nullable()->after('hls_ready_at');
            $table->timestamp('public_mirror_hls_ready_at')->nullable()->after('public_mirror_synced_at');
        });
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->dropColumn(['public_mirror_synced_at', 'public_mirror_hls_ready_at']);
        });
    }
};
