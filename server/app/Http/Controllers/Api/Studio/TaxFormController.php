<?php

namespace App\Http\Controllers\Api\Studio;

use App\Http\Controllers\Controller;
use App\Models\TaxForm;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Per-user creator tax forms for Reelsoo Studio. Each creator sees and manages
 * only their own forms. Uploaded identity/address proofs are stored under the
 * signature-gated documents prefix via StorageService (same path verification
 * documents use), and their keys are never returned to the client.
 */
class TaxFormController extends Controller
{
    public function __construct(private readonly StorageService $storage)
    {
    }

    /** GET /studio/tax-forms — the caller's own forms, newest first. */
    public function index(Request $request): JsonResponse
    {
        $forms = TaxForm::query()
            ->where('user_id', $request->user()->id)
            ->latest()
            ->get()
            ->map(fn (TaxForm $f) => $f->toApiArray())
            ->all();

        return response()->json(['success' => true, 'data' => $forms]);
    }

    /** POST /studio/tax-forms — submit a new form (multipart, optional docs). */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'form_type'         => ['required', Rule::in(['W-8BEN', 'W-9', 'W-8BEN-E', 'Other'])],
            'entity_kind'       => ['nullable', Rule::in(['Individual', 'Entity'])],
            'first_name'        => ['required', 'string', 'max:120'],
            'middle_name'       => ['nullable', 'string', 'max:120'],
            'last_name'         => ['required', 'string', 'max:120'],
            'dob'               => ['nullable', 'string', 'max:60'],
            'citizenship'       => ['nullable', 'string', 'max:120'],
            'residence_country' => ['nullable', 'string', 'max:120'],
            'residence_tin'     => ['nullable', 'string', 'max:120'],
            'addr1'             => ['nullable', 'string', 'max:255'],
            'addr2'             => ['nullable', 'string', 'max:255'],
            'city'              => ['nullable', 'string', 'max:120'],
            'tin_type'          => ['nullable', 'string', 'max:40'],
            'tax_id'            => ['nullable', 'string', 'max:120'],
            'identity_doc'      => ['nullable', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:10240'],
            'address_doc'       => ['nullable', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:10240'],
        ]);

        $identityKey = $request->hasFile('identity_doc')
            ? $this->storage->storeDocument($request->file('identity_doc'))
            : null;
        $addressKey = $request->hasFile('address_doc')
            ? $this->storage->storeDocument($request->file('address_doc'))
            : null;

        $form = TaxForm::create([
            'user_id'           => $request->user()->id,
            'form_type'         => $data['form_type'],
            'entity_kind'       => $data['entity_kind'] ?? 'Individual',
            'status'            => 'under_review',
            'first_name'        => $data['first_name'],
            'middle_name'       => $data['middle_name'] ?? null,
            'last_name'         => $data['last_name'],
            'dob'               => $data['dob'] ?? null,
            'citizenship'       => $data['citizenship'] ?? null,
            'residence_country' => $data['residence_country'] ?? null,
            'residence_tin'     => $data['residence_tin'] ?? null,
            'addr1'             => $data['addr1'] ?? null,
            'addr2'             => $data['addr2'] ?? null,
            'city'              => $data['city'] ?? null,
            'tin_type'          => $data['tin_type'] ?? null,
            'tax_id'            => $data['tax_id'] ?? null,
            'identity_doc_key'  => $identityKey,
            'address_doc_key'   => $addressKey,
        ]);

        // Human-readable, collision-free submission id derived from the row id.
        $form->submission_id = sprintf('TXF-%d-%06d', $form->created_at->year, $form->id);
        $form->save();

        return response()->json(['success' => true, 'data' => $form->toApiArray()], 201);
    }

    /** DELETE /studio/tax-forms/{id} — remove one of the caller's own forms. */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $form = TaxForm::where('user_id', $request->user()->id)->find($id);
        if (! $form) {
            return response()->json(['success' => false, 'message' => 'Tax form not found'], 404);
        }

        $this->storage->delete($form->identity_doc_key);
        $this->storage->delete($form->address_doc_key);
        $form->delete();

        return response()->json(['success' => true]);
    }
}
