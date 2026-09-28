<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\View\View;

class WebController extends Controller
{
    public function home(): View
    {
        return view('website.home');
    }

    public function about(): View
    {
        return view('website.about');
    }

    public function download(): View
    {
        return view('website.download');
    }

    public function privacy(): View
    {
        return view('website.privacy');
    }

    public function terms(): View
    {
        return view('website.terms');
    }

    public function contact(): View
    {
        return view('website.contact');
    }

    public function sendContact(Request $request)
    {
        $request->validate([
            'name'    => ['required', 'string', 'max:100'],
            'email'   => ['required', 'email'],
            'message' => ['required', 'string', 'max:2000'],
        ]);

        // TODO Phase 8: send email notification
        return back()->with('success', 'Your message has been sent. We will get back to you shortly.');
    }
}
