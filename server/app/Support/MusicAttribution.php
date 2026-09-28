<?php

namespace App\Support;

use App\Models\Video;

/**
 * What a video's audio is credited to, decided in one place.
 *
 * The label is built HERE, not in each client. Three surfaces formatting
 * "Original Track — {artist}" and "Original Sound — @{username}" for themselves
 * is three chances to disagree, and disagreeing about who a piece of music
 * belongs to is not a cosmetic bug. iOS, Android and the website render the
 * string this returns.
 *
 * Wording is deliberate and load-bearing:
 *
 *   "Original Track — The Weeknd"   a recording was identified, and this is the
 *                                   artist credited on it
 *   "Original Sound — @ankit"       nothing matched, so the audio is credited to
 *                                   the account that uploaded it
 *
 * Neither says "owned by", and neither may be changed to. A catalog match
 * identifies a recording; it does not establish who holds the copyright, and it
 * says nothing about whether Reelsoo is licensed to carry it. "Original Sound"
 * is likewise a statement about provenance - this audio came from this account -
 * and not a claim that the uploader wrote it.
 */
class MusicAttribution
{
    /* Where recognition got to. Kept in sync with the values written to
     * videos.recognition_status by the migration's comment. */
    public const STATUS_PROCESSING     = 'processing';
    public const STATUS_RECOGNIZED     = 'recognized';
    public const STATUS_NO_MATCH       = 'no_match';
    public const STATUS_LOW_CONFIDENCE = 'low_confidence';
    public const STATUS_FAILED         = 'failed';

    /* What the UI should render. */
    public const TYPE_RECOGNIZED = 'recognized_track';
    public const TYPE_ORIGINAL   = 'original_sound';
    public const TYPE_PROCESSING = 'processing';

    /**
     * @return array{type:string,label:?string,status:?string,track:?array,creator:?array}
     */
    public static function for(Video $video): array
    {
        $status = $video->recognition_status;

        // Still deciding. Returns no label on purpose: showing "Original Sound"
        // now and swapping it for an artist a few seconds later credits the
        // wrong person in the meantime, and every viewer who scrolled past in
        // that window saw a claim that was not true. The clients hide the row
        // until this resolves.
        if ($status === self::STATUS_PROCESSING) {
            return [
                'type'    => self::TYPE_PROCESSING,
                'label'   => null,
                'status'  => $status,
                'track'   => null,
                'creator' => null,
            ];
        }

        $track = $video->relationLoaded('recognizedTrack') ? $video->recognizedTrack : null;

        if ($status === self::STATUS_RECOGNIZED && $track) {
            return [
                'type'   => self::TYPE_RECOGNIZED,
                'label'  => 'Original Track — ' . $track->artist_name,
                'status' => $status,
                'track'  => [
                    'id'              => $track->id,
                    'title'           => $track->title,
                    'artist_name'     => $track->artist_name,
                    'album_title'     => $track->album_title,
                    'artwork_url'     => $track->artwork_url,
                    // Null when the provider gave none. The clients must hide
                    // the button rather than build a URL - a guessed Apple
                    // Music link lands on a 404, which is worse than no button.
                    'apple_music_url' => $track->apple_music_url ?: null,
                    'shazam_web_url'  => $track->shazam_web_url ?: null,
                    'isrc'            => $track->isrc,
                    'shazam_id'       => $track->shazam_id,
                    'explicit'        => (bool) $track->explicit,
                ],
                'creator' => null,
            ];
        }

        // Everything else - no match, too weak to name an artist, the attempt
        // failed, or a video from before this feature existed - is credited to
        // the uploader. A weak match is treated exactly like no match: naming an
        // artist the system is unsure about is the one outcome worth avoiding
        // outright, since it misattributes someone's own work to a stranger.
        $user = $video->relationLoaded('user') ? $video->user : null;

        return [
            'type'   => self::TYPE_ORIGINAL,
            'label'  => $user ? 'Original Sound — @' . $user->username : 'Original Sound',
            'status' => $status,
            'track'  => null,
            'creator' => $user ? [
                'id'       => $user->id,
                'username' => $user->username,
                'name'     => $user->name,
            ] : null,
        ];
    }
}
