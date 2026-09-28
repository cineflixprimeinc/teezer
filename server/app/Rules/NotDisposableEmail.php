<?php

namespace App\Rules;

use App\Services\TextModerationService;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/** Rejects sign-ups from known disposable / temp-mail domains. */
class NotDisposableEmail implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (!is_string($value) || $value === '') {
            return;
        }
        if (app(TextModerationService::class)->isDisposableEmail($value)) {
            $fail('Disposable or temporary email addresses are not allowed. Please use a permanent email.');
        }
    }
}
