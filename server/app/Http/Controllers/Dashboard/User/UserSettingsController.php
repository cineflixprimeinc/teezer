<?php

namespace App\Http\Controllers\Dashboard\User;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\View\View;
use Illuminate\Http\RedirectResponse;

class UserSettingsController extends Controller
{
    public function index(): View
    {
        return view('dashboard.user.settings');
    }

    public function update(Request $request): RedirectResponse
    {
        return redirect()->route('user.settings.index')->with('success', 'Settings updated.');
    }
}
