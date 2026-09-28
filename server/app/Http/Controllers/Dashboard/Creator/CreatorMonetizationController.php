<?php

namespace App\Http\Controllers\Dashboard\Creator;

use App\Http\Controllers\Controller;
use Illuminate\View\View;

class CreatorMonetizationController extends Controller
{
    public function index(): View
    {
        return view('dashboard.creator.monetization');
    }
}
