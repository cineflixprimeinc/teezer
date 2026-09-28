<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => 'OK',
            'data'    => [
                'app'       => config('app.name'),
                'version'   => '1.0.0',
                'timestamp' => now()->toIso8601String(),
            ],
        ]);
    }
}
