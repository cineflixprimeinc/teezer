<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\IntegrationSetting;
use App\Services\Integrations\ConnectionTester;
use App\Services\Integrations\IntegrationRegistry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Admin API behind Settings > Third-Party Integrations.
 *
 * Everything here is admin-only and credential-bearing, so three rules hold
 * throughout:
 *
 *  - A secret is NEVER returned. Responses carry a masked preview
 *    (••••••••abcd) and an is_set flag; the real value leaves the server only
 *    when the provider itself is called.
 *  - A blank secret field on save means "leave unchanged", not "clear". Round-
 *    tripping a masked value from a form would otherwise overwrite a live key
 *    with dots the first time an admin edited an unrelated field.
 *  - Nothing logged here includes a credential.
 */
class AdminIntegrationController extends Controller
{
    /* ── GET /admin/integrations ─────────────────────────────────────── */

    /**
     * Every declared provider, grouped for the settings page. Includes providers
     * with no database row yet - they show their .env-resolved state, which is
     * how an admin discovers what is already configured.
     */
    public function index(): JsonResponse
    {
        $providers = [];
        foreach (array_keys(IntegrationRegistry::definitions()) as $provider) {
            $providers[] = IntegrationRegistry::maskedFor($provider);
        }

        return response()->json([
            'success' => true,
            'data'    => [
                'groups'    => config('integrations.groups', []),
                'providers' => $providers,
            ],
        ]);
    }

    /* ── GET /admin/integrations/{provider} ──────────────────────────── */

    public function show(string $provider): JsonResponse
    {
        if (IntegrationRegistry::definition($provider) === null) {
            return response()->json(['success' => false, 'message' => 'Unknown integration.'], 404);
        }

        return response()->json(['success' => true, 'data' => IntegrationRegistry::maskedFor($provider)]);
    }

    /* ── PUT /admin/integrations/{provider} ──────────────────────────── */

    public function update(Request $request, string $provider): JsonResponse
    {
        $definition = IntegrationRegistry::definition($provider);
        if ($definition === null) {
            return response()->json(['success' => false, 'message' => 'Unknown integration.'], 404);
        }

        $validated = $request->validate([
            'enabled' => ['sometimes', 'boolean'],
            'fields'  => ['sometimes', 'array'],
            'fields.*' => ['nullable', 'string', 'max:8000'],
        ]);

        $row = IntegrationSetting::firstOrNew(['provider' => $provider]);

        $credentials = $row->credentials ?? [];
        $settings    = $row->settings ?? [];
        $submitted   = $validated['fields'] ?? [];

        foreach ($definition['fields'] ?? [] as $key => $field) {
            // Only fields the provider actually declares. An unknown key in the
            // payload is ignored rather than stored, so the encrypted blob can
            // never become a dumping ground for attacker-chosen data.
            if (! array_key_exists($key, $submitted)) {
                continue;
            }

            $value  = $submitted[$key];
            $secret = $field['secret'] ?? false;

            if ($secret) {
                // Blank means "unchanged" - the form never receives the real
                // value, so it cannot send it back. Clearing is an explicit
                // action (the Reset button), not an empty input.
                if (blank($value)) {
                    continue;
                }
                $credentials[$key] = $value;
            } else {
                // A non-secret CAN be cleared by blanking it: endpoints and
                // callback URLs are shown in full, so an empty box is a genuine
                // instruction to fall back to env/default.
                $settings[$key] = blank($value) ? null : $value;
            }
        }

        // Reject a save that would enable a provider it cannot actually use -
        // otherwise the panel reports "enabled" while every call fails.
        $enabled = $validated['enabled'] ?? $row->enabled ?? false;
        if ($enabled) {
            $missing = $this->missingRequired($definition, $credentials, $settings);
            if ($missing !== []) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot enable: ' . implode(', ', $missing) . ' required.',
                ], 422);
            }
        }

        $row->fill([
            'provider'    => $provider,
            'enabled'     => $enabled,
            'credentials' => $credentials ?: null,
            'settings'    => $settings ?: null,
            'updated_by'  => $request->user()?->id,
        ])->save();

        IntegrationRegistry::forget($provider);

        // Who changed what, never the values. The field NAMES are enough to
        // audit a rotation; the values are exactly what must not be here.
        Log::info('Integration settings updated', [
            'provider'   => $provider,
            'enabled'    => $enabled,
            'fields'     => array_keys($submitted),
            'admin_id'   => $request->user()?->id,
        ]);

        return response()->json(['success' => true, 'data' => IntegrationRegistry::maskedFor($provider)]);
    }

    /* ── POST /admin/integrations/{provider}/test ────────────────────── */

    public function test(string $provider, ConnectionTester $tester): JsonResponse
    {
        if (IntegrationRegistry::definition($provider) === null) {
            return response()->json(['success' => false, 'message' => 'Unknown integration.'], 404);
        }

        $result = $tester->test($provider);

        // Persist the outcome so the list view shows status without re-testing
        // every provider. firstOrNew: a provider configured purely from .env has
        // no row until its first test, and the result is worth keeping.
        $row = IntegrationSetting::firstOrNew(['provider' => $provider]);
        $row->provider = $provider;
        $row->recordTest($result['ok'], $result['ok'] ? null : $result['message']);

        IntegrationRegistry::forget($provider);

        return response()->json([
            'success' => $result['ok'],
            'message' => $result['message'],
            'data'    => IntegrationRegistry::maskedFor($provider),
        ]);
    }

    /* ── DELETE /admin/integrations/{provider} ───────────────────────── */

    /**
     * Reset: drop the stored row entirely.
     *
     * This does NOT disable the integration - it returns it to whatever .env
     * says, which for most providers is the working production value. That is
     * the intended escape hatch when a change made in the panel breaks
     * something: reset, and the deployed configuration takes over again.
     */
    public function destroy(Request $request, string $provider): JsonResponse
    {
        if (IntegrationRegistry::definition($provider) === null) {
            return response()->json(['success' => false, 'message' => 'Unknown integration.'], 404);
        }

        IntegrationSetting::where('provider', $provider)->delete();
        IntegrationRegistry::forget($provider);

        Log::warning('Integration settings reset to environment defaults', [
            'provider' => $provider,
            'admin_id' => $request->user()?->id,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Reset to environment configuration.',
            'data'    => IntegrationRegistry::maskedFor($provider),
        ]);
    }

    /** @return list<string> labels of required fields still blank */
    private function missingRequired(array $definition, array $credentials, array $settings): array
    {
        $missing = [];

        foreach ($definition['fields'] ?? [] as $key => $field) {
            if (! ($field['required'] ?? false)) {
                continue;
            }

            $stored = ($field['secret'] ?? false) ? ($credentials[$key] ?? null) : ($settings[$key] ?? null);
            // env counts: a provider already working from the deployed
            // environment is legitimately configured even with an empty panel.
            $fromEnv = ! empty($field['env']) ? env($field['env']) : null;

            if (blank($stored) && blank($fromEnv) && blank($definition['defaults'][$key] ?? null)) {
                $missing[] = $field['label'];
            }
        }

        return $missing;
    }
}
