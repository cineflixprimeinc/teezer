<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminActionLog;
use App\Models\CmsPage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * "CMS & Legal" (admin/src/app/legal/page.tsx) - full CRUD over cms_pages.
 * The page (and its calls into adminService.cmsPages()/updateCmsPage())
 * already existed with nothing behind it; this is that backend.
 *
 * Read side for the public/live pages is CmsController::show() (no auth) -
 * see routes/api.php's `/app/cms/{slug}` - which only ever returns a row
 * that is both published AND has real content, so a page an admin hasn't
 * touched yet (empty content, unpublished by default - see the
 * 2026_09_01_150001 migration) is invisible there and the requesting page
 * falls back to its own existing hardcoded content instead.
 */
class AdminCmsController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => CmsPage::orderBy('title')->get(),
        ]);
    }

    public function show(string $slug): JsonResponse
    {
        $page = CmsPage::where('slug', $slug)->firstOrFail();

        return response()->json(['success' => true, 'data' => $page]);
    }

    /**
     * New policy/CMS page, for "admin wants to add a new policy" -
     * slug is chosen once here and is what the corresponding page.tsx on
     * the site would need to fetch by (a new route still has to be added
     * on the frontend to actually serve it at a URL - this endpoint only
     * creates the editable CMS row).
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'slug'              => ['required', 'string', 'max:80', 'regex:/^[a-z0-9]+(-[a-z0-9]+)*$/', 'unique:cms_pages,slug'],
            'title'             => ['required', 'string', 'max:150'],
            'content'           => ['nullable', 'string'],
            'meta_title'        => ['nullable', 'string', 'max:150'],
            'meta_description'  => ['nullable', 'string', 'max:300'],
            'is_published'      => ['sometimes', 'boolean'],
            'locale'            => ['sometimes', 'string', 'max:10'],
        ]);

        $page = CmsPage::create([
            ...$validated,
            'is_published' => $validated['is_published'] ?? false,
            'locale'       => $validated['locale'] ?? 'en',
            'updated_by'   => $request->user()->id,
        ]);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'create_cms_page',
            target: $page,
            description: "Created CMS page: {$page->slug}",
        );

        return response()->json(['success' => true, 'data' => $page], 201);
    }

    public function update(Request $request, string $slug): JsonResponse
    {
        $page = CmsPage::where('slug', $slug)->firstOrFail();

        $validated = $request->validate([
            'title'             => ['sometimes', 'string', 'max:150'],
            'content'           => ['nullable', 'string'],
            'meta_title'        => ['nullable', 'string', 'max:150'],
            'meta_description'  => ['nullable', 'string', 'max:300'],
            'is_published'      => ['sometimes', 'boolean'],
            'locale'            => ['sometimes', 'string', 'max:10'],
        ]);

        $page->update([...$validated, 'updated_by' => $request->user()->id]);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'update_cms_page',
            target: $page,
            description: "Updated CMS page: {$page->slug}",
        );

        return response()->json(['success' => true, 'data' => $page->fresh()]);
    }

    /**
     * Core legal pages (terms/privacy/guidelines) can be unpublished and
     * emptied back out, but never deleted outright - the site links to
     * these slugs from dozens of places (signup, checkout, footers) and a
     * missing row there is a broken link, not just an empty page.
     */
    private const PROTECTED_SLUGS = ['terms', 'privacy', 'guidelines'];

    public function destroy(Request $request, string $slug): JsonResponse
    {
        if (in_array($slug, self::PROTECTED_SLUGS, true)) {
            return response()->json([
                'success' => false,
                'message' => 'This page is a core legal page and cannot be deleted. Unpublish it instead.',
            ], 422);
        }

        $page = CmsPage::where('slug', $slug)->firstOrFail();

        AdminActionLog::record(
            admin: $request->user(),
            action: 'delete_cms_page',
            target: $page,
            description: "Deleted CMS page: {$page->slug}",
        );

        $page->delete();

        return response()->json(['success' => true]);
    }
}
