<?php

namespace App\Http\Controllers\Api;

use App\Models\CmsPage;
use Illuminate\Http\JsonResponse;

/**
 * Public, unauthenticated read side of the CMS & Legal system (see
 * Admin\AdminCmsController for the editing side). Every legal/policy page
 * on the site (and the equivalent list in mobile's PoliciesScreen.tsx)
 * calls this by its own slug to check "has an admin published real
 * content for me?" - a null `data` means no, and the caller renders its
 * own existing hardcoded fallback content unchanged.
 */
class CmsController
{
    public function show(string $slug): JsonResponse
    {
        $page = CmsPage::where('slug', $slug)
            ->where('is_published', true)
            ->whereNotNull('content')
            ->where('content', '!=', '')
            ->first();

        return response()->json(['success' => true, 'data' => $page]);
    }
}
