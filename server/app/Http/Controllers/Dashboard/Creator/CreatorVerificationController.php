<?php

namespace App\Http\Controllers\Dashboard\Creator;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\View\View;
use Illuminate\Http\RedirectResponse;

class CreatorVerificationController extends Controller
{
    public function index(): View
    {
        return view('dashboard.creator.verification');
    }

    public function apply(Request $request): RedirectResponse
    {
        $request->validate([
            'category'     => ['required', 'string'],
            'document_url' => ['required', 'url'],
            'reason'       => ['required', 'string', 'max:1000'],
        ]);

        return redirect()->route('creator.verification.index')->with('success', 'Verification application submitted.');
    }
}
