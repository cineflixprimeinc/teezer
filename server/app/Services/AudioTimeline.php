<?php

namespace App\Services;

use App\Models\MusicTrack;

/**
 * Validates and clamps a video's audio timeline.
 *
 * Two layers - the original recording and an added music track - each with its
 * own level and mute, and the music additionally positioned: which section of
 * the source plays, and where on the video it lands.
 *
 * Everything here treats the client as untrusted. A phone reports a duration it
 * measured, offsets a finger dragged to, and a track id typed into a request;
 * none of it can be taken at face value, and the failure modes are not
 * theoretical. A music_video_start past the end of the video renders silence
 * over a clip the user thought had a soundtrack. A source range longer than the
 * track reads past the file. A negative offset, once multiplied into a sample
 * position, is a negative seek. So each value is checked against the project
 * duration and the real track length, and clamped rather than rejected -
 * somebody dragging a selection to the very end of a song should get the last
 * few seconds, not a validation error.
 *
 * Deliberately NOT here: which recording a video contains. That is
 * MusicAttribution and the recognition pipeline, and it answers "what is this
 * music". This answers "how should it be mixed". Merging them would make an
 * identification a licence, and the two must be able to disagree.
 */
class AudioTimeline
{
    /** Fades are polish; a long one is an edit and belongs on the timeline. */
    private const MAX_FADE_MS = 3000;

    /** Below this a music layer cannot be heard as music, only as a click. */
    private const MIN_MUSIC_MS = 250;

    /**
     * @param  array<string,mixed>  $input   validated request data
     * @param  int|null             $projectDurationMs  measured server-side where possible
     * @return array<string,mixed>  columns to persist
     */
    public function resolve(array $input, ?int $projectDurationMs): array
    {
        $duration = $projectDurationMs !== null ? max(0, $projectDurationMs) : null;

        $out = [
            'project_duration_ms'     => $duration,
            'original_audio_volume'   => $this->volume($input['original_audio_volume'] ?? null, 100),
            'music_volume'            => $this->volume($input['music_volume'] ?? null, 50),
            'is_original_audio_muted' => (bool) ($input['is_original_audio_muted'] ?? false),
            'is_music_muted'          => (bool) ($input['is_music_muted'] ?? false),
            'music_auto_duck'         => (bool) ($input['music_auto_duck'] ?? false),
            'music_fade_in_ms'        => $this->clamp((int) ($input['music_fade_in_ms'] ?? 0), 0, self::MAX_FADE_MS),
            'music_fade_out_ms'       => $this->clamp((int) ($input['music_fade_out_ms'] ?? 0), 0, self::MAX_FADE_MS),
        ];

        $trackId = $input['music_track_id'] ?? null;
        if (! $trackId) {
            // No music: clear the whole layer rather than leaving offsets from a
            // track that is no longer attached, which would be applied to
            // whatever got attached next.
            return $out + [
                'music_source_start_ms' => null,
                'music_source_end_ms'   => null,
                'music_video_start_ms'  => null,
            ];
        }

        // The track's real length, read from our own row - never from the
        // request. A caller claiming a 3-minute track is 10 minutes long would
        // otherwise get a selection reading past the end of the file.
        $track      = MusicTrack::find($trackId);
        $trackMs    = $track && $track->duration ? (int) round((float) $track->duration * 1000) : null;

        $srcStart = max(0, (int) ($input['music_source_start_ms'] ?? 0));
        $srcEnd   = (int) ($input['music_source_end_ms'] ?? 0);

        if ($trackMs !== null) {
            $srcStart = min($srcStart, max(0, $trackMs - self::MIN_MUSIC_MS));
            $srcEnd   = $srcEnd > 0 ? min($srcEnd, $trackMs) : $trackMs;
        }
        if ($srcEnd <= $srcStart) {
            // An inverted or empty selection is a client bug, not an intent.
            // Falling back to "from here to the end of the track" keeps the edit
            // usable instead of failing a publish over a dragged handle.
            $srcEnd = $trackMs ?? ($srcStart + self::MIN_MUSIC_MS);
        }

        $videoStart = max(0, (int) ($input['music_video_start_ms'] ?? 0));

        if ($duration !== null) {
            // Music cannot begin after the video has ended - that is a silent
            // track the user believes they added.
            $videoStart = min($videoStart, max(0, $duration - self::MIN_MUSIC_MS));

            // THE boundary rule: whatever remains of the video from where the
            // music starts is all the music there can be. A 20s clip with music
            // starting at 5s plays 15s of it, however long the selection is.
            $available = max(0, $duration - $videoStart);
            if ($srcEnd - $srcStart > $available) {
                $srcEnd = $srcStart + $available;
            }

            // A fade cannot outlast the sound it is fading.
            $len = max(0, $srcEnd - $srcStart);
            $out['music_fade_in_ms']  = min($out['music_fade_in_ms'], intdiv($len, 2));
            $out['music_fade_out_ms'] = min($out['music_fade_out_ms'], intdiv($len, 2));
        }

        return $out + [
            'music_source_start_ms' => $srcStart,
            'music_source_end_ms'   => $srcEnd,
            'music_video_start_ms'  => $videoStart,
        ];
    }

    /** 0-100, with anything unusable falling back to the layer's default. */
    private function volume(mixed $value, int $default): int
    {
        if ($value === null || ! is_numeric($value)) {
            return $default;
        }

        return $this->clamp((int) $value, 0, 100);
    }

    private function clamp(int $v, int $min, int $max): int
    {
        return max($min, min($max, $v));
    }
}
