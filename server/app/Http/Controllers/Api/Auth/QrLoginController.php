<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Models\QrLoginTicket;
use App\Services\AuthTokenService;
use App\Services\IsoCountries;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * QR-code login - the website's "Use QR code" button, scanned and approved
 * from the already-logged-in mobile app.
 *
 *   1. create()  - website mints a ticket, shows it as a QR code, starts polling status().
 *   2. scan()    - phone (already authenticated) decodes the QR, calls this to
 *                  claim the ticket and see WHOSE session it's about to approve.
 *   3. confirm() / deny() - phone's Authorize screen.
 *   4. status()  - website's poll. Once confirmed, hands back the SAME
 *                  {token, expires_at, user} shape a password login returns
 *                  (AuthTokenService::mint(), same helper issueLoginToken()
 *                  uses) - exactly once, ever, for this ticket.
 *
 * `id` is a long random opaque string, not a sequential id - nothing about a
 * ticket is guessable/enumerable from another one. status() and create() are
 * deliberately unauthenticated (the whole point is logging IN); scan(),
 * confirm() and deny() require the phone's own existing session, same as
 * any other authenticated app action.
 */
class QrLoginController extends Controller
{
    public function __construct(private ?AuthTokenService $tokens = null)
    {
        $this->tokens ??= app(AuthTokenService::class);
    }

    private const TTL_MINUTES = 2;

    /** POST /auth/qr/create - unauthenticated. */
    public function create(Request $request): JsonResponse
    {
        $meta = json_decode($this->tokens->describeSession($request), true) ?? [];
        $meta['cf_country'] = strtoupper((string) $request->header('cf-ipcountry')) ?: null;
        // The raw string, not just the parsed label - syntheticWebRequest()
        // needs to hand this back to describeSession() a second time at
        // confirm(), and "Chrome on Windows" itself doesn't contain the
        // "Chrome/" etc. substrings that parse depends on.
        $meta['raw_user_agent'] = $request->userAgent() ?? '';

        $ticket = QrLoginTicket::create([
            'id'           => Str::random(48),
            'status'       => QrLoginTicket::STATUS_PENDING,
            'session_meta' => $meta,
            'expires_at'   => now()->addMinutes(self::TTL_MINUTES),
        ]);

        return response()->json(['success' => true, 'data' => [
            'ticket'     => $ticket->id,
            'expires_at' => $ticket->expires_at->toIso8601String(),
        ]]);
    }

    /** GET /auth/qr/status/{ticket} - unauthenticated, polled by the website. */
    public function status(Request $request, string $ticket): JsonResponse
    {
        $row = QrLoginTicket::find($ticket);

        if (! $row || $row->isExpired()) {
            return response()->json(['success' => true, 'data' => ['status' => 'expired']]);
        }

        if ($row->status === QrLoginTicket::STATUS_CONFIRMED && $row->token && ! $row->token_delivered_at) {
            // Capture before clearing - only the request that wins this
            // atomic update gets to return it, and the row's own copy is
            // gone the instant it's handed out, not just marked delivered.
            $tokenToReturn = $row->token;
            $tokenExpiresAt = $row->token_expires_at;
            $affected = QrLoginTicket::where('id', $ticket)
                ->where('status', QrLoginTicket::STATUS_CONFIRMED)
                ->whereNull('token_delivered_at')
                ->update(['token_delivered_at' => now(), 'token' => null]);

            if ($affected === 1) {
                return response()->json(['success' => true, 'data' => [
                    'status'     => 'confirmed',
                    'token'      => $tokenToReturn,
                    'token_type' => 'Bearer',
                    'expires_at' => $tokenExpiresAt?->toIso8601String(),
                    'user'       => $row->user ? \App\Support\AuthUserResource::make($row->user) : null,
                ]]);
            }
            // Lost the race to another poller - fall through, already delivered.
        }

        return response()->json(['success' => true, 'data' => ['status' => $row->status]]);
    }

    /** POST /auth/qr/scan/{ticket} - authenticated (the scanning phone). */
    public function scan(Request $request, string $ticket): JsonResponse
    {
        $row = QrLoginTicket::find($ticket);
        if (! $row || $row->isExpired()) {
            return response()->json(['success' => false, 'message' => 'This code has expired.'], 404);
        }
        if ($row->status !== QrLoginTicket::STATUS_PENDING && $row->user_id !== $request->user()->id) {
            return response()->json(['success' => false, 'message' => 'This code has already been used.'], 409);
        }

        if ($row->status === QrLoginTicket::STATUS_PENDING) {
            $row->update(['status' => QrLoginTicket::STATUS_SCANNED, 'user_id' => $request->user()->id]);
        }

        $meta = $row->session_meta ?? [];
        $countryName = $meta['cf_country'] ? (IsoCountries::map()[$meta['cf_country']] ?? $meta['cf_country']) : null;

        return response()->json(['success' => true, 'data' => [
            'ticket'   => $row->id,
            'label'    => $meta['label'] ?? 'a web browser',
            'ip'       => $meta['ip'] ?? null,
            'country'  => $countryName,
        ]]);
    }

    /** POST /auth/qr/confirm/{ticket} - authenticated (must be the scanning phone). */
    public function confirm(Request $request, string $ticket): JsonResponse
    {
        // Approving twice is a success, not a conflict.
        //
        // A flaky connection can drop the response after the ticket was already
        // confirmed, and the phone's retry then hit ownedScannedTicket()'s
        // status check - the ticket is CONFIRMED, not SCANNED - and answered
        // "This code is no longer waiting for you." The web session had in fact
        // been created; the only thing wrong was the message the person read.
        //
        // Narrow on purpose: same ticket, same user, still unexpired, already
        // confirmed. No token is minted here, so a retry cannot produce a second
        // session, and a ticket confirmed by somebody else still falls through
        // to the ownership check below.
        $existing = QrLoginTicket::find($ticket);
        if (
            $existing
            && ! $existing->isExpired()
            && $existing->status === QrLoginTicket::STATUS_CONFIRMED
            && $existing->user_id === $request->user()->id
        ) {
            return response()->json(['success' => true, 'message' => 'Login approved.']);
        }

        $row = $this->ownedScannedTicket($request, $ticket);
        if ($row instanceof JsonResponse) {
            return $row;
        }

        // The resulting session belongs to the WEBSITE that showed the code,
        // not this phone - mint against a synthetic request carrying what
        // create() captured (its own UA/IP/CF-IPCountry), so the country-
        // change audit and session label reflect the browser that will
        // actually hold it, not wherever the phone happens to be right now.
        $minted = $this->tokens->mint($row->user, $this->syntheticWebRequest($row));

        $row->update([
            'status'           => QrLoginTicket::STATUS_CONFIRMED,
            'token'            => $minted['token'],
            'token_expires_at' => $minted['expires_at'],
        ]);

        return response()->json(['success' => true, 'message' => 'Login approved.']);
    }

    /** POST /auth/qr/deny/{ticket} - authenticated (must be the scanning phone). */
    public function deny(Request $request, string $ticket): JsonResponse
    {
        $row = $this->ownedScannedTicket($request, $ticket);
        if ($row instanceof JsonResponse) {
            return $row;
        }

        $row->update(['status' => QrLoginTicket::STATUS_DENIED]);

        return response()->json(['success' => true, 'message' => 'Login denied.']);
    }

    /** Shared confirm()/deny() guard: must exist, not be expired, be scanned, and belong to this exact user. */
    private function ownedScannedTicket(Request $request, string $ticket): QrLoginTicket|JsonResponse
    {
        $row = QrLoginTicket::find($ticket);
        if (! $row || $row->isExpired()) {
            return response()->json(['success' => false, 'message' => 'This code has expired.'], 404);
        }
        if ($row->status !== QrLoginTicket::STATUS_SCANNED || $row->user_id !== $request->user()->id) {
            return response()->json(['success' => false, 'message' => 'This code is no longer waiting for you.'], 409);
        }

        return $row;
    }

    private function syntheticWebRequest(QrLoginTicket $ticket): Request
    {
        $meta = $ticket->session_meta ?? [];
        $server = [
            'HTTP_USER_AGENT' => $meta['raw_user_agent'] ?? '',
            'REMOTE_ADDR'     => $meta['ip'] ?? '127.0.0.1',
        ];
        if (! empty($meta['cf_country'])) {
            $server['HTTP_CF_IPCOUNTRY'] = $meta['cf_country'];
        }

        return Request::create('/', 'POST', [], [], [], $server);
    }
}
