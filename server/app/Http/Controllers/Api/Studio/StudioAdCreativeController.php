<?php

namespace App\Http\Controllers\Api\Studio;

use App\Http\Controllers\Controller;
use App\Models\AdCreative;
use App\Models\AdGroup;
use App\Services\Ads\AdAccountService;
use App\Services\MediaPresignService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Ad creatives: presigned upload for custom video/image assets, plus attaching a creative
 * (an uploaded asset or a boosted existing video) to an ad group the caller owns.
 */
class StudioAdCreativeController extends Controller
{
    private const CTA = 'learn_more,shop_now,sign_up,download,watch_more,book_now,contact_us,get_offer';
    private const DIR = 'ads/creatives';

    public function __construct(private AdAccountService $accounts, private MediaPresignService $r2) {}

    /** Presigned PUT URL for a custom creative asset (browser uploads directly to R2). */
    public function uploadUrl(Request $request): JsonResponse
    {
        $data = $request->validate([
            'file_name'    => ['required', 'string', 'max:200'],
            'content_type' => ['required', 'string', 'max:100'],
        ]);

        if (! preg_match('#^(video|image)/#i', $data['content_type'])) {
            return response()->json(['success' => false, 'message' => 'Only video or image creatives are allowed.'], 422);
        }

        $res = $this->r2->createUploadUrl($request->user()->id, $data['file_name'], $data['content_type'], self::DIR);

        return response()->json(['success' => true, 'data' => $res]);
    }

    public function store(Request $request, int $groupId): JsonResponse
    {
        $group = $this->ownedGroup($request, $groupId);

        $data = $request->validate([
            'type'            => ['nullable', 'in:video,image,carousel'],
            'video_id'        => ['nullable', 'integer', 'exists:videos,id'],
            'asset_key'       => ['nullable', 'string', 'max:255'],
            'thumbnail_url'   => ['nullable', 'url', 'max:500'],
            'headline'        => ['nullable', 'string', 'max:120'],
            'body'            => ['nullable', 'string', 'max:300'],
            'cta_type'        => ['nullable', 'in:' . self::CTA],
            'destination_url' => ['nullable', 'url', 'max:500'],
            'display_name'    => ['nullable', 'string', 'max:120'],
        ]);

        if (empty($data['video_id']) && empty($data['asset_key'])) {
            return response()->json(['success' => false, 'message' => 'Provide a video_id (to boost a video) or an uploaded asset_key.'], 422);
        }

        $mediaUrl = null;
        if (! empty($data['asset_key'])) {
            $key = $data['asset_key'];
            if (! $this->r2->keyBelongsToUser($key, $request->user()->id, self::DIR) || ! $this->r2->objectExists($key)) {
                return response()->json(['success' => false, 'message' => 'Creative asset not found or not yours.'], 422);
            }
            $mediaUrl = $this->r2->publicUrl($key);
        }

        $creative = $group->creatives()->create([
            'type'            => $data['type'] ?? (! empty($data['video_id']) ? 'video' : 'image'),
            'video_id'        => $data['video_id'] ?? null,
            'asset_key'       => $data['asset_key'] ?? null,
            'media_url'       => $mediaUrl,
            'thumbnail_url'   => $data['thumbnail_url'] ?? null,
            'headline'        => $data['headline'] ?? null,
            'body'            => $data['body'] ?? null,
            'cta_type'        => $data['cta_type'] ?? null,
            'destination_url' => $data['destination_url'] ?? null,
            'display_name'    => $data['display_name'] ?? null,
            'review_status'   => 'pending',
        ]);

        return response()->json(['success' => true, 'data' => $creative], 201);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->ownedCreative($request, $id)->delete();

        return response()->json(['success' => true, 'message' => 'Creative deleted.']);
    }

    private function ownedGroup(Request $request, int $id): AdGroup
    {
        $accountId = $this->accounts->forUser($request->user()->id)->id;

        return AdGroup::whereHas('campaign', fn ($q) => $q->where('ad_account_id', $accountId))->findOrFail($id);
    }

    private function ownedCreative(Request $request, int $id): AdCreative
    {
        $accountId = $this->accounts->forUser($request->user()->id)->id;

        return AdCreative::whereHas('group.campaign', fn ($q) => $q->where('ad_account_id', $accountId))->findOrFail($id);
    }
}
