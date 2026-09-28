<?php

return [
    // Master switch for all text moderation (profanity + disposable email).
    'enabled' => env('TEXT_MODERATION_ENABLED', true),

    // >= this many profanity hits in one piece of text → hold for review.
    // 1 hit → soft warn (still published). 0 → clean. Severe words always block.
    'review_threshold' => (int) env('TEXT_MODERATION_REVIEW_THRESHOLD', 2),

    // Files populated by `php artisan moderation:update-lists` from the
    // open-source projects below. The seed lists keep everything working
    // before/without a fetch, so the filter is never empty.
    'profanity_file'  => 'moderation/profanity_en.txt',
    'disposable_file' => 'moderation/disposable_domains.txt',

    'sources' => [
        // LDNOOBW "List of Dirty, Naughty, Obscene, and Otherwise Bad Words".
        'profanity'  => 'https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/en',
        // disposable-email-domains community blocklist (~30k domains).
        'disposable' => 'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf',
    ],

    // Severe terms → immediate auto-hide / hard reject (tier "block").
    // Curated on purpose; extend via ops. Matching is leet-normalized + word-boundary.
    'severe_words' => [
        'nigger', 'nigga', 'faggot', 'fag', 'retard', 'kike', 'chink', 'spic',
        'tranny', 'coon', 'rape', 'rapist', 'molest', 'pedophile', 'pedo',
        'childporn', 'bestiality', 'kys',
    ],

    // Common profanity seed (augmented by the fetched LDNOOBW list).
    'profanity_seed' => [
        'fuck', 'fucker', 'fucking', 'motherfucker', 'shit', 'bullshit', 'bitch',
        'bastard', 'asshole', 'dickhead', 'cunt', 'cock', 'dick', 'pussy', 'slut',
        'whore', 'wanker', 'jerkoff', 'cum', 'twat', 'prick', 'douchebag',
    ],

    // Disposable / temp-mail domain seed (augmented by the fetched blocklist).
    'disposable_seed' => [
        'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', '10minutemail.com',
        'tempmail.com', 'temp-mail.org', 'yopmail.com', 'trashmail.com', 'getnada.com',
        'dispostable.com', 'sharklasers.com', 'maildrop.cc', 'fakeinbox.com',
        'throwawaymail.com', 'mailnesia.com', 'mohmal.com', 'tempr.email',
        'emailondeck.com', 'mintemail.com', 'spamgourmet.com', 'discard.email',
        'moakt.com', 'tmail.ws', 'tempmailo.com', 'mailpoof.com', 'inboxkitten.com',
    ],
];
