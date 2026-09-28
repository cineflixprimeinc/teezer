<?php

namespace App\Rules;

use App\Services\TextModerationService;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/** Rejects usernames containing profanity or severe terms. */
class CleanUsername implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (!is_string($value) || $value === '') {
            return;
        }
        if (!app(TextModerationService::class)->isCleanHandle($value)) {
            $fail('This username contains words that are not allowed. Please choose another.');
        }
    }
}
