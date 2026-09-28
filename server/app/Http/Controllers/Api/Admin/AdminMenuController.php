<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminActionLog;
use App\Models\MenuItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminMenuController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => MenuItem::orderBy('sort_order')->get(),
        ]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'label'      => ['sometimes', 'string', 'max:50'],
            'is_enabled' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:999'],
            'platform'   => ['sometimes', 'in:web,app,both'],
            'visibility' => ['sometimes', 'array'],
        ]);

        $item = MenuItem::findOrFail($id);
        $item->update($validated);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'update_menu',
            target: $item,
            description: "Updated menu item: {$item->key}",
        );

        return response()->json(['success' => true, 'data' => $item->fresh()]);
    }

    public function bulkReorder(Request $request): JsonResponse
    {
        $request->validate([
            'items'           => ['required', 'array'],
            'items.*.id'      => ['required', 'integer'],
            'items.*.sort_order' => ['required', 'integer'],
        ]);

        foreach ($request->items as $row) {
            MenuItem::where('id', $row['id'])->update(['sort_order' => $row['sort_order']]);
        }

        return response()->json(['success' => true]);
    }
}
