<?php

namespace App\Http\Controllers\Dashboard\User;

use App\Http\Controllers\Controller;
use Illuminate\View\View;

class UserHistoryController extends Controller
{
    public function index(): View
    {
        return view('dashboard.user.history');
    }
}
