<?php

namespace App\Http\Controllers\Api\Studio;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StudioSettingsController extends Controller
{
    /**
     * Get all studio settings (admin only)
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user->role !== 'admin') {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized',
            ], 403);
        }

        $settings = AppSetting::all()->mapWithKeys(fn ($s) => [$s->key => [
            'value'       => $s->value,
            'type'        => $s->type,
            'group'       => $s->group,
            'description' => $s->description,
            'is_public'   => $s->is_public,
        ]]);

        return response()->json([
            'success' => true,
            'data'    => $settings,
        ]);
    }

    /**
     * Get a specific setting
     */
    public function show(Request $request, string $key): JsonResponse
    {
        $user = $request->user();
        if ($user->role !== 'admin') {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized',
            ], 403);
        }

        $setting = AppSetting::where('key', $key)->first();
        if (!$setting) {
            return response()->json([
                'success' => false,
                'message' => 'Setting not found',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data'    => [
                'key'         => $setting->key,
                'value'       => $setting->value,
                'type'        => $setting->type,
                'group'       => $setting->group,
                'description' => $setting->description,
                'is_public'   => $setting->is_public,
            ],
        ]);
    }

    /**
     * Update a setting
     */
    public function update(Request $request, string $key): JsonResponse
    {
        $user = $request->user();
        if ($user->role !== 'admin') {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized',
            ], 403);
        }

        $request->validate([
            'value'       => 'required',
            'type'        => 'in:string,integer,boolean,json',
            'description' => 'nullable|string',
            'is_public'   => 'boolean',
        ]);

        $setting = AppSetting::updateOrCreate(
            ['key' => $key],
            [
                'value'       => $request->input('value'),
                'type'        => $request->input('type', 'string'),
                'description' => $request->input('description'),
                'is_public'   => $request->input('is_public', false),
                'group'       => $request->input('group', 'general'),
            ]
        );

        \Illuminate\Support\Facades\Cache::forget("app_setting:{$key}");

        return response()->json([
            'success' => true,
            'data'    => [
                'key'         => $setting->key,
                'value'       => $setting->value,
                'type'        => $setting->type,
            ],
        ]);
    }

    /**
     * Clear backend cache/config cache from the studio settings panel.
     */
    public function clearCache(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user->role !== 'admin') {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized',
            ], 403);
        }

        \Illuminate\Support\Facades\Cache::flush();
        \Illuminate\Support\Facades\Artisan::call('cache:clear');
        \Illuminate\Support\Facades\Artisan::call('config:clear');

        return response()->json([
            'success' => true,
            'message' => 'Cache cleared successfully',
        ]);
    }

    /**
     * Test database connection
     */
    public function testConnection(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user->role !== 'admin') {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized',
            ], 403);
        }

        try {
            \Illuminate\Support\Facades\DB::connection()->getPdo();

            return response()->json([
                'success' => true,
                'message' => 'Database connection successful',
                'database' => [
                    'driver'   => config('database.default'),
                    'host'     => config('database.connections.' . config('database.default') . '.host'),
                    'database' => config('database.connections.' . config('database.default') . '.database'),
                ],
            ]);
        } catch (\Exception $e) {
            // The driver's message spells out host, port, database and user -
            // and for a TLS failure, the server certificate too. Admin-gated is
            // not a reason to return it: this endpoint is reachable with a
            // stolen admin token, and the detail is of no use in a browser
            // anyway. The correlation id is what turns a screenshot of this
            // response into the matching line in the log.
            $correlationId = (string) \Illuminate\Support\Str::uuid();

            \Illuminate\Support\Facades\Log::error('Studio settings: database connection test failed', [
                'correlation_id' => $correlationId,
                'exception'      => $e::class,
                'message'        => $e->getMessage(),
                'user_id'        => $user->id,
            ]);

            return response()->json([
                'success'        => false,
                'message'        => 'Database connection failed',
                'correlation_id' => $correlationId,
            ], 500);
        }
    }
}
