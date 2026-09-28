<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Services\CountryAvailabilityService;
use Illuminate\Http\Request;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\View\View;

class AuthController extends Controller
{
    public function showLogin(): View|RedirectResponse
    {
        if (Auth::check()) {
            return redirect(Auth::user()->getDashboardUrl());
        }

        return view('auth.login');
    }

    public function login(Request $request, CountryAvailabilityService $countryAvailability): RedirectResponse
    {
        $request->validate([
            'email'    => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        // Accept email or username in the "email" field
        $field = filter_var($request->email, FILTER_VALIDATE_EMAIL)
            ? 'email'
            : 'username';

        $credentials = [
            $field     => $request->email,
            'password' => $request->password,
        ];

        if (!Auth::attempt($credentials, $request->boolean('remember'))) {
            return back()
                ->withErrors(['email' => 'The credentials do not match our records.'])
                ->onlyInput('email');
        }

        $user = Auth::user();

        if ($user->is_banned) {
            Auth::logout();
            return back()->withErrors([
                'email' => 'Your account has been suspended. Contact support.',
            ]);
        }

        // Same server-detected-country policy as the API login path
        // (ApiAuthController::login()) - password already verified, so this
        // IS an existing account; the Existing Users policy applies.
        $loginCheck = $countryAvailability->evaluateLoginAccess($request, true);
        if (!$loginCheck['allowed']) {
            Auth::logout();
            return back()->withErrors(['email' => $loginCheck['reason']])->onlyInput('email');
        }

        $request->session()->regenerate();

        // Redirect to intended page, or to role-based dashboard
        return redirect()->intended($user->getDashboardUrl());
    }

    public function showRegister(): View|RedirectResponse
    {
        if (Auth::check()) {
            return redirect(Auth::user()->getDashboardUrl());
        }

        return view('auth.register');
    }

    public function register(Request $request, CountryAvailabilityService $countryAvailability): RedirectResponse
    {
        $request->validate([
            'name'     => ['required', 'string', 'max:100'],
            'username' => ['required', 'string', 'max:50', 'unique:users,username', 'regex:/^[a-zA-Z0-9_\.]+$/'],
            'email'    => ['required', 'email', 'max:191', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
            'country'  => ['nullable', 'string', 'max:100'],
        ]);

        // Same server-detected-country policy as the API signup path
        // (ApiAuthController::register()) - this Blade form is a separate,
        // live account-creation route and was not covered by the country
        // module at all before this check.
        $signupCheck = $countryAvailability->evaluateSignupAccess($request);
        if (!$signupCheck['allowed']) {
            return back()->withErrors(['email' => $signupCheck['reason']])->onlyInput('name', 'username', 'email', 'country');
        }

        $user = \App\Models\User::create([
            'name'     => $request->name,
            'username' => $request->username,
            'email'    => $request->email,
            'password' => $request->password,
            'country'  => $request->country,
        ]);

        Auth::login($user);
        $request->session()->regenerate();

        return redirect($user->getDashboardUrl());
    }

    public function showForgotPassword(): View
    {
        return view('auth.forgot-password');
    }

    public function redirectToDashboard(): RedirectResponse
    {
        return redirect(Auth::user()->getDashboardUrl());
    }

    public function logout(Request $request): RedirectResponse
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('login');
    }
}
