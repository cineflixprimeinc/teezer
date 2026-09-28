<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminActionLog;
use App\Models\RateLimit;
use App\Models\SecurityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminSecurityController extends Controller
{
    public function rateLimits(Request $request): JsonResponse
    {
        $query = RateLimit::query()
            ->when($request->input('q'), function ($q, string $term) {
                $q->where(function ($inner) use ($term) {
                    $inner->where('identifier', 'ilike', "%{$term}%")
                        ->orWhere('action_type', 'ilike', "%{$term}%")
                        ->orWhere('identifier_type', 'ilike', "%{$term}%");
                });
            })
            ->when($request->boolean('blocked_only', true), fn ($q) => $q->where('blocked_until', '>', now()))
            ->latest('updated_at');

        $page = $query->paginate($request->integer('per_page', 30));

        return response()->json([
            'success' => true,
            'data' => $page->items(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    public function unblock(Request $request, int $id): JsonResponse
    {
        $row = RateLimit::findOrFail($id);
        $row->update([
            'attempt_count' => 0,
            'blocked_until' => null,
            'window_start' => now(),
        ]);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'unblock_rate_limit',
            category: 'security',
            target: $row,
            description: "Unblocked {$row->identifier_type} for {$row->action_type}",
            metadata: ['identifier' => $row->identifier],
            severity: 'info',
            ip: $request->ip(),
        );

        return response()->json(['success' => true, 'message' => 'Rate limit unblocked.']);
    }

    public function logs(Request $request): JsonResponse
    {
        $query = SecurityLog::query()
            ->when($request->input('q'), function ($q, string $term) {
                $q->where(function ($inner) use ($term) {
                    $inner->where('identifier', 'ilike', "%{$term}%")
                        ->orWhere('ip_address', 'ilike', "%{$term}%")
                        ->orWhere('action', 'ilike', "%{$term}%")
                        ->orWhere('description', 'ilike', "%{$term}%");
                });
            })
            ->latest();

        $page = $query->paginate($request->integer('per_page', 30));

        return response()->json([
            'success' => true,
            'data' => $page->items(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'total' => $page->total(),
            ],
        ]);
    }
}
