<?php

namespace App\Console\Commands;

use App\Models\MusicTrack;
use App\Models\Video;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Creates "Original audio" MusicTrack records for all published videos
 * that don't yet have a music_track_id. Backfills the sound-page feature
 * for content uploaded before the audio-priority system was deployed.
 *
 *   php artisan sounds:backfill-originals
 *   php artisan sounds:backfill-originals --dry-run
 *   php artisan sounds:backfill-originals --limit=50
 */
class BackfillOriginalAudioTracks extends Command
{
    protected $signature = 'sounds:backfill-originals
                            {--dry-run : Preview without writing to DB}
                            {--limit=0 : Only process this many videos (0 = all)}';

    protected $description = 'Create original-audio MusicTrack records for videos that have no music_track_id';

    public function handle(): int
    {
        $dryRun          = (bool) $this->option('dry-run');
        $limit           = (int)  $this->option('limit');
        $hasAudioTypeCol = Schema::hasColumn('videos', 'audio_type');

        $query = Video::with('user')
            ->whereNull('music_track_id')
            ->where(fn ($q) =>
                $q->whereNull('is_original_audio_muted')
                  ->orWhere('is_original_audio_muted', false)
            )
            ->whereNull('deleted_at')
            ->where('status', 'published')
            ->whereNotNull('video_url');

        $total = $query->count();
        $this->info("Found {$total} published videos without a music track.");

        if ($dryRun) {
            $this->warn('[DRY RUN] No records will be written.');
        }

        if ($limit > 0) {
            $query->limit($limit);
        }

        $hasSourceTypeCol = Schema::hasColumn('music_tracks', 'source_type');
        $hasSourceVideoCol = Schema::hasColumn('music_tracks', 'source_video_id');

        $created = 0;
        $skipped = 0;

        $query->chunk(200, function ($videos) use ($dryRun, $hasAudioTypeCol, $hasSourceTypeCol, $hasSourceVideoCol, &$created, &$skipped) {
            foreach ($videos as $video) {
                $username = $video->user?->username ?? 'unknown';
                $this->line("  Video #{$video->id} - @{$username}");

                if ($dryRun) { $created++; continue; }

                DB::transaction(function () use ($video, $username, $hasAudioTypeCol, $hasSourceTypeCol, $hasSourceVideoCol, &$created) {
                    $trackData = [
                        'title'                 => 'Original audio',
                        'artist_name'           => '@' . $username,
                        'audio_url'             => $video->video_url,
                        'cover_url'             => $video->thumbnail_url,
                        'status'                => 'published',
                        'uses_count'            => 1,
                        'show_in_studio'        => false,
                        'show_in_upload_picker' => false,
                        'allow_reels'           => true,
                        'allow_stories'         => true,
                    ];

                    if ($hasSourceTypeCol)  $trackData['source_type']      = 'original';
                    if ($hasSourceVideoCol) $trackData['source_video_id']  = $video->id;

                    $track = MusicTrack::create($trackData);

                    $attrs = ['music_track_id' => $track->id];
                    if ($hasAudioTypeCol) {
                        $attrs['audio_type'] = 'original_audio';
                    }

                    $video->update($attrs);
                    $created++;
                });
            }
        });

        $this->info($dryRun
            ? "[DRY RUN] Would have created {$created} tracks ({$skipped} skipped)."
            : "Done. Created {$created} original audio tracks.");

        return self::SUCCESS;
    }
}
