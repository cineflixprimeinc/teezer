<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RecognizedTrack;
use App\Models\Video;
use App\Support\MusicAttribution;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Receives a music-recognition result for a video.
 *
 * Recognition runs on the DEVICE. ShazamKit has no server-side API - Apple ships
 * it as an iOS and Android framework only - so the phone matches the audio it
 * already has locally and posts the outcome here. The website has no equivalent,
 * so videos uploaded there stay credited to their uploader.
 *
 * That has a consequence worth stating plainly: the client asserts this. Nothing
 * here can independently verify that a video really contains the recording it
 * claims, because the server never hears the audio. It is accepted because the
 * result drives ATTRIBUTION AND A LINK, not rights, payment or takedowns - the
 * worst a forged submission achieves is a wrong artist credit on one's own
 * video. Anything that ever acts on this - licensing, revenue, enforcement -
 * must re-verify server-side first. See MusicAttribution's note on the
 * difference between identification and ownership.
 */
class VideoMusicRecognitionController extends Controller
{
    /**
     * How much of the sampled audio must agree before an artist is named.
     *
     * ShazamKit reports no confidence score - a match either comes back or it
     * does not - so there is no vendor number to threshold. What the client CAN
     * measure is agreement: it samples several segments spread across the video
     * and reports how many resolved to the same recording. A song playing under
     * the whole clip matches repeatedly; a few seconds of background music
     * behind speech matches once and disagrees elsewhere.
     *
     * Half is the line. One segment out of four is the shape of a passing
     * snatch of audio, or a false positive, and naming an artist on that basis
     * misattributes somebody's own recording to a stranger - the one failure
     * this whole feature must not produce. Below the line the video is credited
     * to its uploader, which is the safe direction to be wrong in.
     */
    private const MIN_AGREEMENT = 0.5;

    public function store(Request $request, Video $video): JsonResponse
    {
        // Only the uploader may describe their own video's audio.
        if ($video->user_id !== $request->user()->id) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $data = $request->validate([
            'status'      => ['required', 'in:recognized,no_match,failed'],
            'confidence'  => ['nullable', 'numeric', 'between:0,1'],
            'matched_offset_seconds'   => ['nullable', 'integer', 'min:0'],
            'matched_duration_seconds' => ['nullable', 'integer', 'min:0'],

            'track'                  => ['required_if:status,recognized', 'array'],
            'track.isrc'             => ['nullable', 'string', 'max:20'],
            'track.shazam_id'        => ['nullable', 'string', 'max:64'],
            'track.title'            => ['required_with:track', 'string', 'max:255'],
            'track.artist_name'      => ['required_with:track', 'string', 'max:255'],
            'track.album_title'      => ['nullable', 'string', 'max:255'],
            'track.artwork_url'      => ['nullable', 'url', 'max:1024'],
            'track.apple_music_id'   => ['nullable', 'string', 'max:64'],
            'track.apple_music_url'  => ['nullable', 'url', 'max:1024'],
            'track.shazam_web_url'   => ['nullable', 'url', 'max:1024'],
            'track.genre'            => ['nullable', 'string', 'max:120'],
            'track.explicit'         => ['nullable', 'boolean'],
        ]);

        // Already settled on a track. Re-posting the same answer is a retry on a
        // dropped response, not a correction, and must not spend another write
        // or re-run the dedupe. A genuinely changed soundtrack clears this first
        // (see clear()), which is what an audio edit does.
        if ($video->recognition_status === MusicAttribution::STATUS_RECOGNIZED) {
            return $this->attributionResponse($video);
        }

        if ($data['status'] !== 'recognized') {
            $video->forceFill([
                'recognition_status' => $data['status'] === 'failed'
                    ? MusicAttribution::STATUS_FAILED
                    : MusicAttribution::STATUS_NO_MATCH,
                'recognition_confidence' => $data['confidence'] ?? null,
                'recognized_at'          => now(),
            ])->save();

            return $this->attributionResponse($video);
        }

        // Matched, but not consistently enough to put a name to it. Recorded
        // rather than discarded: the confidence is the only evidence available
        // later for whether this threshold is set too strictly.
        $confidence = (float) ($data['confidence'] ?? 1.0);
        if ($confidence < self::MIN_AGREEMENT) {
            $video->forceFill([
                'recognition_status'     => MusicAttribution::STATUS_LOW_CONFIDENCE,
                'recognition_confidence' => $confidence,
                'recognized_at'          => now(),
            ])->save();

            return $this->attributionResponse($video);
        }

        $track = RecognizedTrack::findOrCreateFor($data['track']);

        // A match with neither an ISRC nor a Shazam id cannot be stored without
        // creating a fresh duplicate row on every upload of the same song, so it
        // is treated as unrecognised rather than allowed to fragment the table.
        if (! $track) {
            $video->forceFill([
                'recognition_status'     => MusicAttribution::STATUS_NO_MATCH,
                'recognition_confidence' => $confidence,
                'recognized_at'          => now(),
            ])->save();

            return $this->attributionResponse($video);
        }

        $video->forceFill([
            'recognition_status'       => MusicAttribution::STATUS_RECOGNIZED,
            'recognized_track_id'      => $track->id,
            'recognition_confidence'   => $confidence,
            'matched_offset_seconds'   => $data['matched_offset_seconds'] ?? null,
            'matched_duration_seconds' => $data['matched_duration_seconds'] ?? null,
            'recognized_at'            => now(),
        ])->save();

        return $this->attributionResponse($video);
    }

    /**
     * Forget a result so recognition can run again.
     *
     * For an edit that replaces the audio: keeping the old song would credit the
     * video to music it no longer contains. Back to `processing` rather than
     * null, because null reads as "never attempted" and would show the uploader
     * credited to their own sound before the new answer arrives.
     */
    public function clear(Request $request, Video $video): JsonResponse
    {
        if ($video->user_id !== $request->user()->id) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $video->forceFill([
            'recognition_status'       => MusicAttribution::STATUS_PROCESSING,
            'recognized_track_id'      => null,
            'recognition_confidence'   => null,
            'matched_offset_seconds'   => null,
            'matched_duration_seconds' => null,
            'recognized_at'            => null,
        ])->save();

        return $this->attributionResponse($video);
    }

    private function attributionResponse(Video $video): JsonResponse
    {
        $video->load(['recognizedTrack', 'user']);

        return response()->json([
            'success' => true,
            'data'    => MusicAttribution::for($video),
        ]);
    }
}
