<?php

namespace App\Http\Controllers\Dashboard\Creator;

use App\Http\Controllers\Controller;
use Illuminate\View\View;

class CreatorAnalyticsController extends Controller
{
    public function index(): View
    {
        return view('dashboard.creator.analytics');
    }
}
