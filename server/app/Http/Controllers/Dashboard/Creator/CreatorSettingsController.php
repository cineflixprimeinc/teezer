<?php

namespace App\Http\Controllers\Dashboard\Creator;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\View\View;
use Illuminate\Http\RedirectResponse;

class CreatorSettingsController extends Controller
{
    public function index(): View
    {
        return view('dashboard.creator.settings');
    }

    public function update(Request $request): RedirectResponse
    {
        return redirect()->route('creator.settings.index')->with('success', 'Settings updated.');
    }
}
