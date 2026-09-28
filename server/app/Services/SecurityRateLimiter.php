<?php

namespace App\Services;

use App\Models\AdminActionLog;
use App\Models\RateLimit;
use App\Models\SecurityLog;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SecurityRateLimiter
{
    public function device(Request $request): ?string
    {
        $value = trim((string) $request->header('X-Device-Fingerprint', ''));

        return $value !== '' ? substr(hash('sha256', $value), 0, 64) : null;
    }

    public function normalizeAccount(?string $value): ?string
    {
        $value = strtolower(trim((string) $value));

        return $value !== '' ? $value : null;
    }

    public function ensureNotBlocked(Request $request, string $action, array $identifiers, ?string $message = null): void
    {
        foreach ($identifiers as $type => $identifier) {
            if (! $identifier) {
                continue;
            }

            $row = RateLimit::where([
                'identifier' => (string) $identifier,
                'identifier_type' => $type,
                'action_type' => $action,
            ])->first();

            if ($row?->blocked_until?->isFuture()) {
                $this->throwRateLimited($row, $message);
            }
        }
    }

    public function hitOrFail(
        Request $request,
        string $action,
        array $identifiers,
        int $maxAttempts,
        int $windowSeconds,
        array $blockSeconds,
        ?string $message = null,
    ): void {
        foreach ($identifiers as $type => $identifier) {
            if (! $identifier) {
                continue;
            }

            $row = $this->hit((string) $identifier, $type, $action, $maxAttempts, $windowSeconds, $blockSeconds, $request);

            if ($row->blocked_until?->isFuture()) {
                $this->throwRateLimited($row, $message);
            }
        }
    }

    public function reset(string $action, array $identifiers): void
    {
        RateLimit::where('action_type', $action)
            ->where(function ($query) use ($identifiers) {
                foreach ($identifiers as $type => $identifier) {
                    if ($identifier) {
                        $query->orWhere(fn ($q) => $q->where('identifier_type', $type)->where('identifier', (string) $identifier));
                    }
                }
            })
            ->update([
                'attempt_count' => 0,
                'blocked_until' => null,
                'window_start' => now(),
                'updated_at' => now(),
            ]);
    }

    public function retryAfter(RateLimit $row): int
    {
        return max(1, now()->diffInSeconds($row->blocked_until, false));
    }

    public function responseFor(RateLimit $row, ?string $message = null): array
    {
        $retry = $this->retryAfter($row);
        if ($row->action_type === 'wrong_password') {
            $message = "Too many attempts\nFor your account safety, login has been temporarily locked.\nPlease try again in ".$this->humanTime($retry).'.';
        }

        return [
            'success' => false,
            'error' => 'RATE_LIMITED',
            'message' => $message ?: 'Too many attempts. Please try again in '.$this->humanTime($retry).'.',
            'retry_after' => $retry,
        ];
    }

    private function hit(
        string $identifier,
        string $type,
        string $action,
        int $maxAttempts,
        int $windowSeconds,
        array $blockSeconds,
        Request $request,
    ): RateLimit {
        return DB::transaction(function () use ($identifier, $type, $action, $maxAttempts, $windowSeconds, $blockSeconds, $request) {
            $row = RateLimit::where([
                'identifier' => $identifier,
                'identifier_type' => $type,
                'action_type' => $action,
            ])->lockForUpdate()->first();

            if (! $row) {
                $row = RateLimit::create([
                    'identifier' => $identifier,
                    'identifier_type' => $type,
                    'action_type' => $action,
                    'attempt_count' => 0,
                    'window_start' => now(),
                ]);
            }

            if ($row->blocked_until?->isFuture()) {
                return $row;
            }

            if (! $row->window_start || $row->window_start->addSeconds($windowSeconds)->isPast()) {
                $row->attempt_count = 0;
                $row->window_start = now();
            }

            $row->attempt_count++;

            $limitExceeded = $action === 'wrong_password'
                ? $row->attempt_count >= $maxAttempts
                : $row->attempt_count > $maxAttempts;

            if ($limitExceeded) {
                $level = min((int) $row->block_level + 1, count($blockSeconds));
                $seconds = $blockSeconds[$level - 1] ?? end($blockSeconds);
                $row->block_level = $level;
                $row->blocked_until = now()->addSeconds($seconds);
                $row->window_start = now();
                $row->attempt_count = 0;

                $this->log('rate_limited', $request, $row, "Blocked {$type} for {$action}");
            }

            $row->save();

            return $row;
        });
    }

    private function throwRateLimited(RateLimit $row, ?string $message): never
    {
        throw new HttpResponseException(response()->json($this->responseFor($row, $message), 429));
    }

    public function log(string $action, Request $request, ?RateLimit $row = null, string $description = '', array $metadata = []): void
    {
        try {
            SecurityLog::create([
                'action' => $action,
                'severity' => $action === 'successful_login_after_failures' ? 'info' : 'warning',
                'ip_address' => $request->ip(),
                'identifier_type' => $row?->identifier_type,
                'identifier' => $row?->identifier,
                'action_type' => $row?->action_type,
                'description' => $description ?: $action,
                'metadata' => array_filter([
                    ...$metadata,
                    'blocked_until' => $row?->blocked_until?->toIso8601String(),
                    'block_level' => $row?->block_level,
                    'user_agent' => substr((string) $request->userAgent(), 0, 255),
                ]),
            ]);

            AdminActionLog::record(
                admin: null,
                action: $action,
                category: 'security',
                description: $description ?: $action,
                targetType: $row ? 'RateLimit' : null,
                targetId: $row?->id,
                metadata: array_filter([
                    ...$metadata,
                    'identifier_type' => $row?->identifier_type,
                    'action_type' => $row?->action_type,
                    'blocked_until' => $row?->blocked_until?->toIso8601String(),
                    'block_level' => $row?->block_level,
                    'user_agent' => substr((string) $request->userAgent(), 0, 255),
                ]),
                severity: $action === 'successful_login_after_failures' ? 'info' : 'warning',
                ip: $request->ip(),
            );
        } catch (\Throwable) {
            // Security logging should never block auth flows.
        }
    }

    private function humanTime(int $seconds): string
    {
        if ($seconds >= 3600) {
            $hours = (int) ceil($seconds / 3600);
            return $hours.' hour'.($hours === 1 ? '' : 's');
        }

        $minutes = (int) ceil($seconds / 60);
        return $minutes.' minute'.($minutes === 1 ? '' : 's');
    }
}
