<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A word a user has added to one of their Content-Preferences blocklists
 * (keyword | hashtag | not_interested). When another user comments on this
 * user's video or DMs them, the text is checked against these words and a match
 * is rejected - see CommentController@store / MessageController@send.
 */
class UserHiddenWord extends Model
{
    public const TYPES = ['keyword', 'hashtag', 'not_interested'];

    protected $fillable = ['user_id', 'type', 'word'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /** Canonical stored form: trimmed, lower-cased, leading #/@ removed. */
    public static function normalize(string $word): string
    {
        return ltrim(mb_strtolower(trim($word)), '#@');
    }

    /**
     * The first blocklist word of $ownerId that appears in $text, or null.
     * Whole-word, case-insensitive; non-letter/number chars (incl. '#') count
     * as boundaries, so a stored "politics" matches both "politics" and
     * "#politics" but "spam" never matches "spammer". Empty text / no words → null.
     */
    public static function firstBlockedWord(int $ownerId, ?string $text): ?string
    {
        $text = trim((string) $text);
        if ($text === '') {
            return null;
        }

        $words = static::where('user_id', $ownerId)->pluck('word');
        if ($words->isEmpty()) {
            return null;
        }

        $haystack = mb_strtolower($text);
        foreach ($words as $word) {
            $w = (string) $word;
            if ($w === '') {
                continue;
            }
            $pattern = '/(?<![\p{L}\p{N}])' . preg_quote($w, '/') . '(?![\p{L}\p{N}])/u';
            if (preg_match($pattern, $haystack) === 1) {
                return $w;
            }
        }

        return null;
    }
}
