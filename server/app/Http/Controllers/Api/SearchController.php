<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\SearchService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SearchController extends Controller
{
    public function __construct(private readonly SearchService $searchService) {}

    public function search(Request $request): JsonResponse
    {
        $request->validate([
            'q'    => ['required', 'string', 'min:2', 'max:100'],
            'type' => ['nullable', 'in:all,users,videos,hashtags,sounds'],
        ]);

        $q    = strip_tags(trim($request->input('q')));
        $type = $request->input('type', 'all');

        try {
            $data = $this->searchService->search($q, $type, 5, $request->user());
            return response()->json(['success' => true, 'data' => $data]);
        } catch (\Throwable) {
            return response()->json(['success' => false, 'message' => 'Search is temporarily unavailable.'], 503);
        }
    }
}
