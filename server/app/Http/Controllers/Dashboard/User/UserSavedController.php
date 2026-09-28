<?php

namespace App\Http\Controllers\Dashboard\User;

use App\Http\Controllers\Controller;
use Illuminate\View\View;

class UserSavedController extends Controller
{
    public function index(): View
    {
        return view('dashboard.user.saved');
    }
}
