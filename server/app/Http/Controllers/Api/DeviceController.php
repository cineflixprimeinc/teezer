<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\UserDevice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Push device registration.
 *
 * Both methods previously validated and returned `{success: true}` WITHOUT
 * touching the database - every token the app sent was silently discarded, and
 * the endpoint reported success while doing so. (docs/mobile-app-plan.md stated
 * "Device tokens already stored via POST /devices"; that was not true.)
 */
class DeviceController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            // 500 to match the column - an APNs/FCM token can exceed 255, and a
            // truncated token is a device that silently never receives push.
            'device_token' => ['required', 'string', 'max:500'],
            // 'web' was accepted here but the user_devices.platform enum only
            // permits android|ios, so a web registration would have thrown on
            // insert. Rejected up front instead.
            'platform'     => ['required', 'in:android,ios'],
        ]);

        // One row per (user, token). Re-registering the same device - which the
        // app does on every launch, since tokens rotate - must update, not
        // duplicate. The table's UNIQUE(user_id, device_token) backs this.
        $device = UserDevice::updateOrCreate(
            [
                'user_id'      => $request->user()->id,
                'device_token' => $data['device_token'],
            ],
            ['platform' => $data['platform']],
        );

        // The same token can migrate between accounts on a shared handset. Drop
        // it from everyone else, or the previous owner keeps receiving this
        // device's notifications.
        UserDevice::where('device_token', $data['device_token'])
            ->where('user_id', '!=', $request->user()->id)
            ->delete();

        return response()->json([
            'success' => true,
            'message' => 'Device registered.',
            'data'    => ['id' => $device->id],
        ]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        // Scoped to the owner so ids cannot be probed to unregister other
        // people's devices.
        UserDevice::where('id', $id)
            ->where('user_id', $request->user()->id)
            ->delete();

        return response()->json(['success' => true]);
    }

    /**
     * Unregister by token rather than by row id - what a handset signing out
     * actually has.
     *
     * destroy() above needs the id returned by register(), which the app does
     * not keep: it discards that response, and even if it stored it the id
     * would not survive a reinstall or a cold start. The device always knows
     * its own APNs/FCM token, so that is what it can present. Nothing called
     * destroy() at all, which is why a signed-out phone carried on receiving
     * the previous account's notifications until someone else registered the
     * same token on it.
     *
     * Scoped to the owner for the same reason as destroy(): a token is not a
     * secret to whoever holds the handset, but it must not be usable to
     * silence somebody else's device.
     */
    public function unregister(Request $request): JsonResponse
    {
        $data = $request->validate([
            'device_token' => ['required', 'string', 'max:500'],
        ]);

        UserDevice::where('device_token', $data['device_token'])
            ->where('user_id', $request->user()->id)
            ->delete();

        // Deliberately unconditional success: signing out must not fail, and
        // "already gone" is the desired end state either way.
        return response()->json(['success' => true]);
    }
}
