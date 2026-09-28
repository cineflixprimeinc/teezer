<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\LinkPreviewService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LinkPreviewController extends Controller
{
    public function __construct(private readonly LinkPreviewService $previews) {}

    /** GET /link-preview?url=... - returns OG-style metadata for a link. */
    public function show(Request $request): JsonResponse
    {
        $request->validate([
            'url' => ['required', 'string', 'max:2048', 'url'],
        ]);

        $data = $this->previews->preview($request->input('url'));

        return response()->json([
            'success' => $data !== null,
            'data'    => $data,
        ]);
    }
}
