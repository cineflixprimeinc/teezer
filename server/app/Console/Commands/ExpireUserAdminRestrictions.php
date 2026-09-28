<?php

namespace App\Console\Commands;

use App\Models\AppNotification;
use App\Models\UserAdminRestriction;
use App\Models\UserModerationSetting;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class ExpireUserAdminRestrictions extends Command
{
    protected $signature   = 'restrictions:expire';
    protected $description = 'Set is_active=false for admin restrictions whose expires_at has passed.';

    public function handle(): void
    {
        $expired = UserAdminRestriction::where('is_active', true)
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', now())
            ->get();

        foreach ($expired as $restriction) {
            $restriction->update(['is_active' => false]);

            // Sync boolean back to UserModerationSetting
            $modCol = UserAdminRestriction::MOD_COLUMN_MAP[$restriction->restriction_type] ?? null;
            if ($modCol) {
                $modSettings         = UserModerationSetting::forUser($restriction->user_id);
                $modSettings->$modCol = false;
                $modSettings->save();
            }

            AppNotification::create([
                'user_id'     => $restriction->user_id,
                'actor_id'    => null,
                'type'        => 'admin_account_restriction',
                'entity_type' => 'admin_account_update',
                'entity_id'   => $restriction->user_id,
                'message'     => 'Your account restriction has automatically expired and been lifted. - Teezer',
                'is_read'     => false,
            ]);

            Log::info("Expired restriction: user={$restriction->user_id} type={$restriction->restriction_type}");
        }

        $this->info("Expired {$expired->count()} restriction(s).");
    }
}
