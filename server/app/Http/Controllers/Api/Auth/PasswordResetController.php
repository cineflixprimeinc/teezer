<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\SecurityRateLimiter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Password;

class PasswordResetController extends Controller
{
    public function __construct(private readonly SecurityRateLimiter $securityLimiter) {}

    public function sendLink(Request $request): JsonResponse
    {
        $request->validate(['email' => ['required', 'email']]);

        $account = $this->securityLimiter->normalizeAccount($request->email);
        $ids = array_filter([
            'ip' => $request->ip(),
            'account' => $account,
            'device' => $this->securityLimiter->device($request),
        ]);
        $message = 'If this account exists, password reset instructions have been sent.';

        $this->securityLimiter->hitOrFail($request, 'forgot_password_hour', $ids, 3, 3600, [3600, 86400], $message);
        $this->securityLimiter->hitOrFail($request, 'forgot_password_day', $ids, 5, 86400, [86400], $message);

        Password::sendResetLink($request->only('email'));

        return response()->json(['success' => true, 'message' => $message]);
    }

    public function reset(Request $request): JsonResponse
    {
        $request->validate([
            'token'                 => ['required'],
            'email'                 => ['required', 'email'],
            'password'              => ['required', 'min:8', 'confirmed'],
        ]);

        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (User $user, $password) {
                $user->forceFill(['password' => $password])->save();
                $user->tokens()->delete();
            }
        );

        return $status === Password::PASSWORD_RESET
            ? response()->json(['success' => true, 'message' => 'Password reset successfully.'])
            : response()->json(['success' => false, 'message' => 'Invalid or expired reset token.'], 422);
    }
}
