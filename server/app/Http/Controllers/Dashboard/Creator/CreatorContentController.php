<?php

namespace App\Http\Controllers\Dashboard\Creator;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\View\View;
use Illuminate\Http\RedirectResponse;

class CreatorContentController extends Controller
{
    public function index(): View
    {
        return view('dashboard.creator.content');
    }

    public function destroy(int $id): RedirectResponse
    {
        return redirect()->route('creator.content.index')->with('success', 'Video deleted.');
    }

    public function publish(int $id): RedirectResponse
    {
        return redirect()->route('creator.content.index')->with('success', 'Video published.');
    }

    public function archive(int $id): RedirectResponse
    {
        return redirect()->route('creator.content.index')->with('success', 'Video archived.');
    }
}
