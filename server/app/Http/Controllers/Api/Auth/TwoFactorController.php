<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Services\TwoFactorService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Authenticated 2FA management (enable / confirm / disable / recovery codes).
 * The login challenge step itself lives in ApiAuthController.
 */
class TwoFactorController extends Controller
{
    public function __construct(private TwoFactorService $twoFactor) {}

    /** Current status - used by settings screens. */
    public function status(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => ['enabled' => $request->user()->hasTwoFactorEnabled()],
        ]);
    }

    /**
     * Begin setup: generate a fresh (pending, unconfirmed) secret and return
     * the QR payload. Safe to call repeatedly - it regenerates until confirmed.
     */
    public function setup(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->hasTwoFactorEnabled()) {
            return response()->json([
                'success' => false,
                'message' => 'Two-factor authentication is already enabled. Disable it first to re-configure.',
                'code'    => 'TWO_FACTOR_ALREADY_ENABLED',
            ], 409);
        }

        $secret = $this->twoFactor->generateSecret();
        $user->two_factor_secret          = Crypt::encryptString($secret);
        $user->two_factor_confirmed_at    = null;
        $user->two_factor_recovery_codes  = null;
        $user->saveQuietly();

        return response()->json([
            'success' => true,
            'data'    => [
                'secret'      => $secret,
                'otpauth_uri' => $this->twoFactor->otpauthUri($user, $secret),
            ],
        ]);
    }

    /**
     * Confirm setup with the first valid code. Activates 2FA and returns the
     * one-time recovery codes (shown to the user exactly once).
     */
    public function confirm(Request $request): JsonResponse
    {
        $request->validate(['code' => ['required', 'string']]);
        $user = $request->user();

        if (empty($user->two_factor_secret)) {
            return response()->json([
                'success' => false,
                'message' => 'Start two-factor setup first.',
            ], 422);
        }
        if ($user->hasTwoFactorEnabled()) {
            return response()->json([
                'success' => false,
                'message' => 'Two-factor authentication is already enabled.',
            ], 409);
        }

        $secret = Crypt::decryptString($user->two_factor_secret);
        if (! $this->twoFactor->verify($secret, (string) $request->input('code'))) {
            throw ValidationException::withMessages([
                'code' => ['The code is incorrect. Check that your device clock is accurate and try again.'],
            ]);
        }

        $recoveryCodes = $this->twoFactor->generateRecoveryCodes();
        $user->two_factor_recovery_codes = Crypt::encryptString(json_encode($recoveryCodes));
        $user->two_factor_confirmed_at   = now();
        $user->saveQuietly();

        return response()->json([
            'success' => true,
            'message' => 'Two-factor authentication is now enabled.',
            'data'    => ['recovery_codes' => $recoveryCodes],
        ]);
    }

    /** Disable 2FA. Requires the current password as a safety re-check. */
    public function disable(Request $request): JsonResponse
    {
        $request->validate(['password' => ['required', 'string']]);
        $user = $request->user();

        if (! Hash::check($request->input('password'), $user->password)) {
            throw ValidationException::withMessages([
                'password' => ['Your password is incorrect.'],
            ]);
        }

        $user->two_factor_secret         = null;
        $user->two_factor_recovery_codes = null;
        $user->two_factor_confirmed_at   = null;
        $user->saveQuietly();

        return response()->json([
            'success' => true,
            'message' => 'Two-factor authentication has been disabled.',
        ]);
    }

    /** Regenerate the recovery codes (requires 2FA already enabled). */
    public function recoveryCodes(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user->hasTwoFactorEnabled()) {
            return response()->json([
                'success' => false,
                'message' => 'Two-factor authentication is not enabled.',
            ], 422);
        }

        $recoveryCodes = $this->twoFactor->generateRecoveryCodes();
        $user->two_factor_recovery_codes = Crypt::encryptString(json_encode($recoveryCodes));
        $user->saveQuietly();

        return response()->json([
            'success' => true,
            'data'    => ['recovery_codes' => $recoveryCodes],
        ]);
    }
}
