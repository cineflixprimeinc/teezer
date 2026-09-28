<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Video;
use App\Models\VideoComment;
use App\Models\VideoLike;
use App\Models\VideoSave;
use App\Models\VideoShare;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class VideoAnalyticsSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->isLocal()) {
            $this->command->warn('VideoAnalyticsSeeder skipped - not in local environment.');
            return;
        }

        $video = Video::orderBy('id')->first();
        if (! $video) {
            $this->command->warn('No videos found - skipping analytics seed.');
            return;
        }

        $users = User::where('role', '!=', 'admin')->limit(20)->pluck('id')->toArray();

        $sources   = ['for_you', 'for_you', 'for_you', 'following', 'explore', 'profile', 'search'];
        $countries = ['Indonesia', 'United States', 'Philippines', 'Malaysia', 'Thailand', 'Vietnam', 'India'];
        $cities    = ['Jakarta', 'New York', 'Manila', 'Kuala Lumpur', 'Bangkok', 'Ho Chi Minh City', 'Mumbai'];
        $cityMap   = array_combine($countries, $cities);

        $videoDuration = max(10, (int) ($video->duration ?? 30));

        $this->command->info("Seeding analytics for video #{$video->id}: {$video->title}");

        // Seed 14 days of data
        for ($day = 13; $day >= 0; $day--) {
            $date      = now()->subDays($day);
            $viewCount = $day < 7 ? rand(200, 600) : rand(80, 250);

            for ($i = 0; $i < $viewCount; $i++) {
                $createdAt    = $date->copy()->addSeconds(rand(0, 86399));
                $sourceIndex  = array_rand($sources);
                $countryIndex = array_rand($countries);
                $country      = $countries[$countryIndex];

                DB::table('video_views')->insert([
                    'video_id'       => $video->id,
                    'user_id'        => $users ? $users[array_rand($users)] : null,
                    'ip_address'     => null,
                    'watch_duration' => rand(3, $videoDuration),
                    'source'         => $sources[$sourceIndex],
                    'country'        => $country,
                    'city'           => $cityMap[$country],
                    'created_at'     => $createdAt->toDateTimeString(),
                ]);
            }

            // Likes (~8% of views)
            $likeCount = (int) ($viewCount * 0.08);
            for ($i = 0; $i < $likeCount; $i++) {
                $createdAt = $date->copy()->addSeconds(rand(0, 86399));
                $userId    = $users ? $users[array_rand($users)] : null;
                if ($userId) {
                    DB::table('video_likes')->insertOrIgnore([
                        'video_id'   => $video->id,
                        'user_id'    => $userId,
                        'created_at' => $createdAt->toDateTimeString(),
                    ]);
                }
            }

            // Shares (~2% of views)
            $shareCount = (int) ($viewCount * 0.02);
            for ($i = 0; $i < $shareCount; $i++) {
                $createdAt = $date->copy()->addSeconds(rand(0, 86399));
                $platforms = ['whatsapp', 'instagram', 'twitter', 'copy_link', null];
                DB::table('video_shares')->insert([
                    'video_id'   => $video->id,
                    'user_id'    => $users ? $users[array_rand($users)] : null,
                    'platform'   => $platforms[array_rand($platforms)],
                    'created_at' => $createdAt->toDateTimeString(),
                ]);
            }

            // Saves (~3% of views)
            $saveCount = (int) ($viewCount * 0.03);
            for ($i = 0; $i < $saveCount; $i++) {
                $createdAt = $date->copy()->addSeconds(rand(0, 86399));
                $userId    = $users ? $users[array_rand($users)] : null;
                if ($userId) {
                    DB::table('video_saves')->insertOrIgnore([
                        'video_id'   => $video->id,
                        'user_id'    => $userId,
                        'created_at' => $createdAt->toDateTimeString(),
                    ]);
                }
            }
        }

        // A few top comments
        $commentTexts = [
            'This is amazing! 🔥',
            'Love this content! Keep it up',
            'Where is this place? 😍',
            'So peaceful, thanks for sharing 🌿',
            'This view is incredible!',
        ];

        $videoOwner = User::find($video->user_id);
        $commenter  = User::where('id', '!=', $video->user_id)->first();

        if ($commenter) {
            foreach ($commentTexts as $idx => $text) {
                $existing = VideoComment::where('video_id', $video->id)
                    ->where('user_id', $commenter->id)
                    ->where('body', $text)
                    ->exists();

                if (! $existing) {
                    VideoComment::create([
                        'video_id'    => $video->id,
                        'user_id'     => $commenter->id,
                        'body'        => $text,
                        'likes_count' => rand(10, 250),
                        'created_at'  => now()->subDays(rand(0, 7)),
                        'updated_at'  => now(),
                    ]);
                }
            }
        }

        // Refresh the video cached counts
        $video->views_count    = DB::table('video_views')->where('video_id', $video->id)->count();
        $video->likes_count    = DB::table('video_likes')->where('video_id', $video->id)->count();
        $video->comments_count = VideoComment::where('video_id', $video->id)->whereNull('deleted_at')->count();
        $video->shares_count   = DB::table('video_shares')->where('video_id', $video->id)->count();
        $video->saves_count    = DB::table('video_saves')->where('video_id', $video->id)->count();
        $video->save();

        $this->command->info("Done. Views: {$video->views_count}, Likes: {$video->likes_count}");
    }
}
