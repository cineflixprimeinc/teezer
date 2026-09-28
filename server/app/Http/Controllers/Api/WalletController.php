<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WalletController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json(['success' => true, 'data' => []]);
    }

    public function transactions(Request $request): JsonResponse
    {
        return response()->json(['success' => true, 'data' => []]);
    }
}
