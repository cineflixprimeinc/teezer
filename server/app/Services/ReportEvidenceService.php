<?php

namespace App\Services;

use Illuminate\Http\Request;

/**
 * Shared validation + storage for the "evidence" file(s) a reporter can
 * optionally attach to any report flow (video/comment/story/user/
 * conversation/live-stream/Space). One place so all seven report
 * endpoints validate and store evidence identically instead of each
 * re-implementing "loop the files, cap it, store each" slightly
 * differently.
 */
class ReportEvidenceService
{
    public function __construct(private readonly StorageService $storage) {}

    /** Validation rules for the `evidence` file array - merge into the caller's own validate() call. */
    public function rules(): array
    {
        return [
            'evidence'   => ['nullable', 'array', 'max:3'],
            'evidence.*' => ['file', 'mimes:jpeg,jpg,png,webp', 'max:5120'],
        ];
    }

    /** Store every uploaded evidence file, return their storage keys (or null if none were sent). */
    public function store(Request $request): ?array
    {
        if (! $request->hasFile('evidence')) {
            return null;
        }

        $keys = [];
        foreach ((array) $request->file('evidence') as $file) {
            if ($file && $file->isValid()) {
                $keys[] = $this->storage->storeReportEvidence($file);
            }
        }

        return $keys ?: null;
    }
}
