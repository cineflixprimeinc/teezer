<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CountrySellerRequirement;
use App\Models\MonetizationProgram;
use App\Models\SellerDocument;
use App\Models\SellerProfile;
use App\Models\Shop;
use App\Models\TaxForm;
use App\Services\MonetizationEligibilityService;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * The "Sell on Reelsoo" application - Settings → Sell on Reelsoo, NOT the
 * public Shop screen (ShopController). One Shop row per user already exists
 * as a hard DB constraint (shops.user_id is unique), so "don't create a
 * duplicate application" falls out of firstOrCreate() for free - there is
 * structurally nowhere for a second one to live.
 *
 * The draft IS the Shop + SellerProfile row: every step's PUT partially
 * updates one or the other, so leaving mid-wizard and coming back needs no
 * separate "save for later" mechanism - whatever was last written is already
 * there. seller_profile.current_step is only used to tell the wizard which
 * screen to resume on, not to gate what can be read/written.
 *
 * Field ownership:
 *  - shops:          seller_type, country_code, shop_name, tagline (doubles
 *                     as "description"), logo_url, category_id, policies -
 *                     the eventual PUBLIC storefront fields once approved.
 *                     shop_username still exists as a column (unique,
 *                     nullable) but this endpoint no longer asks for or
 *                     writes it - the shop's public handle is always the
 *                     owner's own account username instead (see
 *                     ShopController::show()), never a second one to set up.
 *  - seller_profiles: legal_data (encrypted), agreements, current_step,
 *                     admin_note - PRIVATE, never touched by ShopController.
 *  - seller_documents: one row per uploaded document.
 *  - tax_forms:       reused as-is for tax ID/PAN/VAT collection when the
 *                     country's requirements call for it - see submit().
 */
class SellerApplicationController extends Controller
{
    public function __construct(
        private readonly StorageService $storage,
        private readonly MonetizationEligibilityService $eligibilityService,
    ) {}

    /** Individual-seller legal_data keys this endpoint understands. */
    private const INDIVIDUAL_FIELDS = [
        'legal_full_name', 'date_of_birth', 'residential_address', 'phone', 'email', 'id_type', 'id_number',
    ];

    /** Business-seller legal_data keys this endpoint understands. */
    private const BUSINESS_FIELDS = [
        'legal_business_name', 'business_type', 'business_registration_number', 'business_address',
        'business_phone', 'business_email', 'business_website',
        'authorized_rep_name', 'authorized_rep_dob', 'authorized_rep_position',
    ];

    /** Every document key any country's requirements are allowed to reference. */
    private const KNOWN_DOCUMENTS = ['government_id', 'business_registration_certificate', 'authorized_rep_id', 'proof_of_address'];

    private function draft(Request $request): Shop
    {
        $user = $request->user();

        return Shop::firstOrCreate(
            ['user_id' => $user->id],
            ['shop_name' => $user->name ?? $user->username, 'status' => Shop::STATUS_DRAFT],
        );
    }

    /** GET /seller/application - the full current draft state. */
    public function show(Request $request): JsonResponse
    {
        $user = $request->user();
        $shop = $this->draft($request)->load('sellerProfile', 'documents');
        $profile = $shop->sellerProfile;

        $requirements = null;
        if ($shop->seller_type && $shop->country_code) {
            $req = CountrySellerRequirement::resolve($shop->country_code, $shop->seller_type);
            $requirements = $req ? [
                'required_fields'    => $req->required_fields,
                'required_documents' => $req->required_documents,
                'requires_tax_form'  => $req->requires_tax_form,
            ] : null;
        }

        // Admin-configurable eligibility (Admin Panel -> Monetization Control
        // Center -> Sell on Reelsoo), for the intro screen's requirements
        // checklist, computed live against the same shared metrics/rules
        // every other monetization programme uses.
        //
        // This endpoint still doesn't gate submit() below - once a wizard is
        // in progress, an application is free to be submitted and a human
        // still decides it in /shop/applications, same as always. What DOES
        // gate on `all_met` now is the client's Apply Now/Get Started button
        // (SellerApplicationScreen) - it won't open the wizard for a creator
        // who hasn't met every requirement here, matching Gifts & Coins and
        // every other programme's entry point. If that gate is ever needed
        // server-side too (e.g. a non-app client), enforce it in submit().
        $eligibility = null;
        $program = MonetizationProgram::where('key', 'affiliate')->first();
        if ($program) {
            $country = $shop->country_code ?? $user->selected_country_code ?? $user->detected_country_code;
            $metrics = $this->eligibilityService->metrics($user);
            $eligibility = $this->eligibilityService->evaluateProgram($program, $metrics, $user->id, $country);
        }

        return response()->json(['success' => true, 'data' => [
            'status'               => $shop->status,
            'seller_type'          => $shop->seller_type,
            'country_code'         => $shop->country_code,
            // Suggested default for the country step - the account's own
            // country, never a value the user can spoof from the client.
            'account_country_code' => $user->selected_country_code ?? $user->detected_country_code ?: null,
            'shop_name'            => $shop->shop_name,
            'shop_username'        => $shop->shop_username,
            'description'          => $shop->tagline,
            'logo_url'             => $shop->logoUrl(),
            'category_id'          => $shop->category_id,
            'policies'             => $shop->policies,
            'legal_data'           => $profile?->legal_data,
            'agreements'           => $profile?->agreements,
            'current_step'         => $profile?->current_step,
            'admin_note'           => $profile?->admin_note,
            'submitted_at'         => $profile?->submitted_at?->toIso8601String(),
            'documents'            => $shop->documents->map(fn (SellerDocument $d) => [
                'id'            => $d->id,
                'document_key'  => $d->document_key,
                'status'        => $d->status,
                'admin_note'    => $d->admin_note,
                'uploaded_at'   => $d->created_at->toIso8601String(),
            ])->values(),
            'requirements'   => $requirements,
            'has_tax_form'   => TaxForm::where('user_id', $user->id)->exists(),
            'eligibility'    => $eligibility,
        ]]);
    }

    /** PUT /seller/application - partial update, one or more steps' worth of fields at once. */
    public function update(Request $request): JsonResponse
    {
        $user = $request->user();
        $shop = $this->draft($request);

        // Once approved, the application itself is frozen - changes to a
        // live shop go through Shop Settings (product/shop management),
        // not back through onboarding. Rejected/needs-information stay
        // editable so the seller can correct and resubmit.
        if ($shop->status === Shop::STATUS_APPROVED) {
            return response()->json(['success' => false, 'message' => 'Your shop is already approved - manage it from Shop Settings instead.'], 422);
        }

        $data = $request->validate([
            'seller_type'   => ['sometimes', Rule::in(Shop::SELLER_TYPES)],
            'country_code'  => ['sometimes', 'string', 'size:2'],
            'shop_name'     => ['sometimes', 'string', 'max:60'],
            'description'   => ['sometimes', 'nullable', 'string', 'max:500'],
            'category_id'   => ['sometimes', 'nullable', 'integer', 'exists:shop_categories,id'],
            'policies'      => ['sometimes', 'array'],
            'legal_data'    => ['sometimes', 'array'],
            'agreements'    => ['sometimes', 'array'],
            'current_step'  => ['sometimes', 'nullable', 'string', 'max:40'],
        ]);

        $shopUpdate = array_filter([
            'seller_type'   => $data['seller_type'] ?? null,
            'country_code'  => isset($data['country_code']) ? strtoupper($data['country_code']) : null,
            'shop_name'     => $data['shop_name'] ?? null,
            'tagline'       => array_key_exists('description', $data) ? $data['description'] : null,
            'category_id'   => array_key_exists('category_id', $data) ? $data['category_id'] : null,
        ], fn ($v) => $v !== null);
        // policies merges (not replaces) so a step that only touches shipping
        // doesn't wipe out returns/support already saved by another step.
        if (array_key_exists('policies', $data)) {
            $shopUpdate['policies'] = array_merge($shop->policies ?? [], $data['policies']);
        }
        if ($shopUpdate) {
            $shop->update($shopUpdate);
        }

        if (array_key_exists('legal_data', $data) || array_key_exists('agreements', $data) || array_key_exists('current_step', $data)) {
            $profile = $shop->sellerProfile ?? $shop->sellerProfile()->create([]);
            $profileUpdate = [];
            if (array_key_exists('legal_data', $data)) {
                // Only keys for the chosen seller_type are kept - picking
                // Individual never persists a stray business_* field and
                // vice versa, even if the client sent one.
                $allowed = $shop->seller_type === Shop::SELLER_TYPE_BUSINESS ? self::BUSINESS_FIELDS : self::INDIVIDUAL_FIELDS;
                $incoming = array_intersect_key($data['legal_data'], array_flip($allowed));
                $profileUpdate['legal_data'] = array_merge($profile->legal_data ?? [], $incoming);
            }
            if (array_key_exists('agreements', $data)) {
                $profileUpdate['agreements'] = array_merge($profile->agreements ?? [], $data['agreements']);
            }
            if (array_key_exists('current_step', $data)) {
                $profileUpdate['current_step'] = $data['current_step'];
            }
            $profile->update($profileUpdate);
        }

        return $this->show($request);
    }

    /** POST /seller/application/logo - the shop's own logo (separate from the owner's personal avatar). */
    public function uploadLogo(Request $request): JsonResponse
    {
        $request->validate(['logo' => ['required', 'file', 'image', 'max:5120']]);

        $shop = $this->draft($request);
        $key = $this->storage->storeImage($request->file('logo'), 'shops');
        $shop->update(['logo_url' => $this->storage->url($key)]);

        return response()->json(['success' => true, 'data' => ['logo_url' => $shop->logoUrl()]]);
    }

    /** POST /seller/application/documents - one verification document (government ID, business registration, ...). */
    public function uploadDocument(Request $request): JsonResponse
    {
        $data = $request->validate([
            'document_key' => ['required', 'string', Rule::in(self::KNOWN_DOCUMENTS)],
            'file'         => ['required', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'],
        ]);

        $shop = $this->draft($request);
        $key = $this->storage->storeDocument($request->file('file'), 'documents/seller');

        // Re-uploading the same document key replaces the previous attempt
        // (and resets it to pending) rather than accumulating duplicates.
        $doc = SellerDocument::updateOrCreate(
            ['shop_id' => $shop->id, 'document_key' => $data['document_key']],
            ['file_key' => $key, 'status' => SellerDocument::STATUS_PENDING, 'admin_note' => null],
        );

        return response()->json(['success' => true, 'data' => [
            'id' => $doc->id, 'document_key' => $doc->document_key, 'status' => $doc->status,
        ]], 201);
    }

    /** DELETE /seller/application/documents/{id} */
    public function destroyDocument(Request $request, int $id): JsonResponse
    {
        $shop = $this->draft($request);
        $doc = SellerDocument::where('shop_id', $shop->id)->where('id', $id)->first();
        if (!$doc) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }
        $doc->delete();

        return response()->json(['success' => true]);
    }

    /**
     * POST /seller/application/submit - the only way status leaves
     * draft/needs_information and enters admin review. Re-validates
     * completeness server-side (never trusts the client's own step-by-step
     * progress tracking) against whatever country_seller_requirements
     * resolves for this shop's seller_type+country.
     */
    public function submit(Request $request): JsonResponse
    {
        $user = $request->user();
        $shop = $this->draft($request)->load('sellerProfile', 'documents');
        $profile = $shop->sellerProfile;

        if (!in_array($shop->status, [Shop::STATUS_DRAFT, Shop::STATUS_INCOMPLETE, Shop::STATUS_NEEDS_INFORMATION, Shop::STATUS_REJECTED], true)) {
            return response()->json(['success' => false, 'message' => 'This application cannot be submitted from its current status.'], 422);
        }

        $missing = [];
        if (!$shop->seller_type) $missing[] = 'seller_type';
        if (!$shop->country_code) $missing[] = 'country_code';
        if (!$shop->shop_name) $missing[] = 'shop_name';
        if (!$shop->category_id) $missing[] = 'category_id';

        $requirement = $shop->seller_type && $shop->country_code
            ? CountrySellerRequirement::resolve($shop->country_code, $shop->seller_type)
            : null;

        $legalData = $profile?->legal_data ?? [];
        foreach ($requirement?->required_fields ?? [] as $field) {
            if (empty($legalData[$field])) {
                $missing[] = $field;
            }
        }

        $haveDocs = $shop->documents->where('status', '!=', SellerDocument::STATUS_REJECTED)->pluck('document_key');
        foreach ($requirement?->required_documents ?? [] as $docKey) {
            if (!$haveDocs->contains($docKey)) {
                $missing[] = "document:{$docKey}";
            }
        }

        if ($requirement?->requires_tax_form && !TaxForm::where('user_id', $user->id)->exists()) {
            $missing[] = 'tax_form';
        }

        $agreements = $profile?->agreements ?? [];
        foreach (['seller_terms', 'marketplace_policies', 'accuracy_confirmed', 'tax_compliance'] as $key) {
            if (empty($agreements[$key]['accepted_at'])) {
                $missing[] = "agreement:{$key}";
            }
        }

        if ($missing) {
            throw ValidationException::withMessages(['application' => 'Required information is missing.', 'missing' => $missing]);
        }

        DB::transaction(function () use ($shop, $profile) {
            $shop->update(['status' => Shop::STATUS_PENDING_REVIEW]);
            $profile->update(['submitted_at' => now(), 'admin_note' => null]);
        });

        return $this->show($request);
    }
}
