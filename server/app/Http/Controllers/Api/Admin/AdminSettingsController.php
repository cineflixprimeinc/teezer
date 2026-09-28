<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminActionLog;
use App\Models\AppSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use App\Services\QueueDepthService;
use Illuminate\Support\Facades\DB;

class AdminSettingsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = AppSetting::query();

        if ($group = $request->get('group')) {
            $query->where('group', $group);
        }

        $settings = $query->orderBy('group')->orderBy('key')->get();

        return response()->json(['success' => true, 'data' => $settings]);
    }

    public function update(Request $request): JsonResponse
    {
        $request->validate([
            'key'   => ['required', 'string', 'max:100'],
            'value' => ['required'],
            'type'  => ['nullable', 'in:string,boolean,integer,json'],
            'group' => ['nullable', 'string', 'max:50'],
        ]);

        $key   = $request->key;
        $value = $request->value;
        $type  = $request->get('type', 'string');

        $old = AppSetting::where('key', $key)->first()?->value;
        AppSetting::set($key, $value, $type);

        if ($request->get('group')) {
            AppSetting::where('key', $key)->update(['group' => $request->group]);
        }

        AdminActionLog::record(
            admin: $request->user(),
            action: 'update_setting',
            target: null,
            description: "Updated setting: {$key}",
            metadata: ['key' => $key, 'old' => $old, 'new' => $value],
        );

        return response()->json(['success' => true, 'message' => 'Setting updated.']);
    }

    // ── Feature flags (stored as boolean app_settings with group=features) ──

    public function features(): JsonResponse
    {
        $features = AppSetting::where('group', 'features')->get()
            ->mapWithKeys(fn ($s) => [$s->key => (bool) $s->value]);

        // Ensure all known feature flags exist
        $defaults = [
            'feature_live'          => true,
            'feature_stories'       => true,
            'feature_messages'      => true,
            'feature_studio'        => true,
            'feature_monetization'  => true,
            'feature_ads'           => false,
            'feature_wallet'        => true,
            'feature_verification'  => true,
            'feature_comments'      => true,
            'feature_downloads'     => true,
            'feature_duet'          => true,
            'feature_stitch'        => true,
            'feature_country_lock'  => true,
            'feature_search'        => true,
            'feature_creator_levels'=> true,
            'feature_audio_rooms'   => true,
            'feature_notifications' => true,
        ];

        foreach ($defaults as $key => $default) {
            if (!isset($features[$key])) {
                AppSetting::set($key, $default ? '1' : '0', 'boolean', 'features');
                $features[$key] = $default;
            }
        }

        return response()->json(['success' => true, 'data' => $features]);
    }

    public function toggleFeature(Request $request, string $key): JsonResponse
    {
        $request->validate(['enabled' => ['required', 'boolean']]);

        $enabled = (bool) $request->enabled;
        AppSetting::set($key, $enabled ? '1' : '0', 'boolean');

        // Ensure group is features
        AppSetting::where('key', $key)->update(['group' => 'features']);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'toggle_feature',
            target: null,
            description: ($enabled ? 'Enabled' : 'Disabled') . " feature: {$key}",
            metadata: ['feature' => $key, 'enabled' => $enabled],
        );

        return response()->json(['success' => true, 'message' => 'Feature flag updated.']);
    }

    public function systemHealth(): JsonResponse
    {
        $dbOk = true;
        try {
            DB::select('SELECT 1');
        } catch (\Throwable) {
            $dbOk = false;
        }

        $searchOk = false;
        try {
            $protocol = config('services.typesense.protocol', 'http');
            $host     = config('services.typesense.host', '127.0.0.1');
            $port     = config('services.typesense.port', '8108');
            $res      = @file_get_contents("{$protocol}://{$host}:{$port}/health");
            $searchOk = $res && str_contains($res, '"ok":true');
        } catch (\Throwable) {}

        // Driver-aware - see QueueDepthService. Counting the `jobs` table
        // directly reports a permanent 0 under the redis driver, which would
        // have made this status light incapable of ever showing "busy".
        $queueDepth = app(QueueDepthService::class)->pending() ?? 0;

        return response()->json([
            'success' => true,
            'data'    => [
                'database'   => $dbOk    ? 'operational' : 'error',
                'search'     => $searchOk ? 'operational' : 'degraded',
                'queue'      => ['depth' => $queueDepth, 'status' => $queueDepth < 100 ? 'operational' : 'busy'],
                'app_env'    => config('app.env'),
                'php_version'=> PHP_VERSION,
                'timestamp'  => now()->toIso8601String(),
            ],
        ]);
    }

    public function groups(): JsonResponse
    {
        $groups = AppSetting::selectRaw('"group", count(*) as count')
            ->groupBy('group')
            ->pluck('count', 'group');

        return response()->json(['success' => true, 'data' => $groups]);
    }
}
