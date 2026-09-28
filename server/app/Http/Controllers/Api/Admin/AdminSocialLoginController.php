<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminActionLog;
use App\Services\SocialLoginConfig;
use App\Services\SocialLoginTester;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Admin › Social Login. Lets an admin paste and manage the OAuth credentials
 * used by mobile social sign-in (Google, Apple, Facebook, TikTok). Secrets are
 * encrypted at rest by SocialLoginConfig and never returned in clear text.
 */
class AdminSocialLoginController extends Controller
{
    /** GET /admin/social-login — current config with secrets masked. */
    public function index(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => SocialLoginConfig::forAdmin(),
        ]);
    }

    /**
     * POST /admin/social-login — update one field or toggle a provider.
     *   { provider, field, value }   → set a credential field
     *   { provider, enabled: bool }  → enable / disable the provider
     */
    public function update(Request $request): JsonResponse
    {
        $request->validate([
            'provider' => ['required', 'string'],
            'field'    => ['nullable', 'string'],
            'value'    => ['nullable', 'string', 'max:8000'],
            'enabled'  => ['nullable', 'boolean'],
        ]);

        $provider = (string) $request->input('provider');
        if (! SocialLoginConfig::isValidProvider($provider)) {
            throw ValidationException::withMessages(['provider' => ['Unknown provider.']]);
        }

        // Enable / disable toggle.
        if ($request->has('enabled') && ! $request->filled('field')) {
            $enabled = $request->boolean('enabled');
            SocialLoginConfig::setEnabled($provider, $enabled);
            AdminActionLog::record(
                admin: $request->user(),
                action: 'update_social_login',
                description: ($enabled ? 'Enabled' : 'Disabled') . " {$provider} sign-in",
                metadata: ['provider' => $provider, 'enabled' => $enabled],
            );
            return response()->json(['success' => true, 'message' => ucfirst($provider) . ($enabled ? ' enabled.' : ' disabled.')]);
        }

        // Credential field update.
        $field  = (string) $request->input('field');
        $schema = SocialLoginConfig::schema()[$provider]['fields'] ?? [];
        if (! array_key_exists($field, $schema)) {
            throw ValidationException::withMessages(['field' => ['Unknown field for this provider.']]);
        }

        SocialLoginConfig::put($provider, $field, $request->input('value'));

        AdminActionLog::record(
            admin: $request->user(),
            action: 'update_social_login',
            description: "Updated {$provider} {$field}",
            // Never write the raw secret to the audit log.
            metadata: [
                'provider' => $provider,
                'field'    => $field,
                'set'      => $request->filled('value'),
            ],
        );

        return response()->json(['success' => true, 'message' => 'Saved.']);
    }

    /**
     * POST /admin/social-login/{provider}/test — checks the currently SAVED
     * credentials against the provider itself. See SocialLoginTester's own
     * docblock for exactly what each provider's test can and can't prove
     * without a real user completing a sign-in.
     */
    public function test(string $provider, SocialLoginTester $tester): JsonResponse
    {
        if (! SocialLoginConfig::isValidProvider($provider)) {
            throw ValidationException::withMessages(['provider' => ['Unknown provider.']]);
        }

        $result = $tester->test($provider);

        AdminActionLog::record(
            admin: request()->user(),
            action: 'test_social_login',
            description: 'Tested ' . ucfirst($provider) . ' sign-in - ' . ($result['ok'] ? 'connected' : 'failed'),
            metadata: ['provider' => $provider, 'ok' => $result['ok']],
        );

        return response()->json(['success' => $result['ok'], 'message' => $result['message']]);
    }
}
