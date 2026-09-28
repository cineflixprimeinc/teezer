<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Seeds the vocabulary that until now lived as hardcoded arrays in the admin
 * upload page.
 *
 * Done as a migration rather than a seeder because it is a one-off move of
 * existing behaviour into the database, not sample data: every environment
 * needs these the moment the picker starts reading from the table, and a
 * seeder that nobody remembers to run would leave the list empty.
 *
 * Values are copied verbatim, punctuation and all ("R&B / Soul", not "R&B
 * Soul"), because tracks already carry these exact strings and the admin
 * screens match the two by name.
 */
return new class extends Migration
{
    private const GENRES = [
        'Pop', 'Hip-hop', 'R&B / Soul', 'Electronic / EDM', 'Dance', 'Rock',
        'Indie / Alternative', 'Jazz', 'Classical', 'Folk / Acoustic',
        'Country', 'Reggae', 'Lo-fi', 'Cinematic / Film Score', 'Ambient',
        'Instrumental', 'Nepali', 'Hindi / Bollywood', 'Latin', 'Afrobeats',
        'K-Pop', 'J-Pop', 'Gospel / Worship', 'Blues', 'Punk', 'Metal',
        'Trap', 'Drill', 'House', 'Techno', 'Drum & Bass', 'SFX',
    ];

    private const MOODS = [
        'Happy', 'Chill', 'Romantic', 'Motivational', 'Sad / Melancholy',
        'Energetic', 'Peaceful', 'Dark / Mysterious', 'Epic / Dramatic',
        'Workout / Pump-up', 'Vlog / Casual', 'Travel / Adventure',
        'Calm / Relaxing', 'Party / Festive', 'Study / Focus', 'Morning Vibes',
        'Nostalgic', 'Dreamy', 'Angry / Intense', 'Uplifting', 'Spiritual',
        'Suspenseful', 'Playful / Fun', 'Romantic / Love', 'Cinematic',
    ];

    private const LANGUAGES = [
        'English', 'Nepali', 'Hindi', 'Spanish', 'French', 'Portuguese',
        'Instrumental / No Lyrics',
    ];

    public function up(): void
    {
        $now  = now();
        $rows = [];

        foreach (['genre' => self::GENRES, 'mood' => self::MOODS, 'language' => self::LANGUAGES] as $kind => $names) {
            foreach (array_values($names) as $i => $name) {
                $rows[] = [
                    'kind'       => $kind,
                    'name'       => $name,
                    // Seeded in the order the picker showed them, so the list
                    // an admin already knows does not reshuffle under them.
                    'sort_order' => $i,
                    'is_active'  => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }
        }

        // Ignores anything already present, so re-running cannot collide with
        // the unique (kind, name) index.
        DB::table('music_taxonomy_terms')->insertOrIgnore($rows);
    }

    public function down(): void
    {
        // Only the seeded rows. Terms an admin added since are theirs to keep.
        foreach (['genre' => self::GENRES, 'mood' => self::MOODS, 'language' => self::LANGUAGES] as $kind => $names) {
            DB::table('music_taxonomy_terms')->where('kind', $kind)->whereIn('name', $names)->delete();
        }
    }
};
