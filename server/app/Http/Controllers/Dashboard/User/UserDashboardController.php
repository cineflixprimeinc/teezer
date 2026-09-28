<?php

namespace App\Http\Controllers\Dashboard\User;

use App\Http\Controllers\Controller;
use Illuminate\View\View;

class UserDashboardController extends Controller
{
    public function index(): View
    {
        $user = auth()->user();
        return view('dashboard.user.index', compact('user'));
    }
}
