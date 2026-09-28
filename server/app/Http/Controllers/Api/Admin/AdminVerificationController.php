<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Mail\AdminActionMail;
use App\Models\AdminActionLog;
use App\Models\User;
use App\Jobs\SyncCreatorMonetization;
use App\Models\VerificationPayment;
use App\Models\VerificationRequest;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;

class AdminVerificationController extends Controller
{
    /**
     * Tell the user what happened, in the app and/or by email.
     *
     * Both channels are best-effort and independently wrapped. A dead SMTP host must not
     * roll back an approval that already happened, and a failed push must not stop the
     * email - the decision is the source of truth, the telling is a side effect.
     *
     * Callers pass explicit booleans rather than us guessing: an admin quietly cleaning
     * up a duplicate application shouldn't be forced to email someone about it.
     */
    private function tellUser(
        User $user,
        string $actionType,
        string $actionLabel,
        string $description,
        bool $inApp,
        bool $byEmail,
        ?string $note = null,
    ): void {
        if ($inApp) {
            try {
                app(NotificationService::class)->notify($user, 'system', [
                    'message' => $description,
                ]);
            } catch (\Throwable) {}
        }

        if ($byEmail && $user->email) {
            try {
                $first = $user->name ? explode(' ', $user->name)[0] : $user->username;

                Mail::to($user->email)->queue(new AdminActionMail(
                    firstName:   $first,
                    username:    $user->username,
                    actionType:  $actionType,
                    actionLabel: $actionLabel,
                    description: $description,
                    adminNote:   $note,
                ));
            } catch (\Throwable) {}
        }
    }

    /**
     * Hide OPEN applications (draft / pending) from users who already hold the badge.
     *
     * They have nothing to review: the person is verified, so approving their draft
     * would change nothing and rejecting it would be meaningless. They were pure noise
     * in the queue.
     *
     * Deliberately scoped to draft/pending only. Excluding every verified user outright
     * would empty the Approved tab of its own contents - approving a request is exactly
     * what SETS is_verified, so "approved" and "user is verified" are the same people.
     * Their decided applications stay, as history.
     */
    private function hideVerifiedApplicants($query)
    {
        return $query->where(fn ($q) =>
            $q->whereIn('status', ['approved', 'rejected'])
              ->orWhereHas('user', fn ($u) => $u->where('is_verified', false))
        );
    }

    public function index(Request $request): JsonResponse
    {
        $userId = $request->get('user_id');

        $query = VerificationRequest::query()
            ->with([
                'user:id,name,username,avatar,email,role,is_verified,created_at',
                'reviewer:id,name',
            ])
            ->orderByDesc('created_at');

        // "all" is the admin's default tab. Previously ANY request without an explicit
        // status was silently filtered to `pending`, so an "All Applications" view was
        // impossible to ask for - the absence of a filter WAS a filter.
        $status = (string) $request->get('status', 'all');
        if ($status !== '' && $status !== 'all') {
            $query->where('status', $status);
        }

        // Everything for one user - powers the Verification tab on the 360 profile,
        // which is where the documents and the approve/reject decision now live.
        //
        // The already-verified filter must NOT apply here: a verified user's own tab is
        // precisely where you go to see the application that verified them.
        if ($userId) {
            $query->where('user_id', (int) $userId);
        } else {
            // Drafts are forms the creator started and never submitted - there is
            // nothing to review and no decision to make, so they do not belong in
            // the admin queue. They were the bulk of it (6 of 7 rows), which made
            // the list read as a backlog of work that did not exist.
            //
            // Scoped to the queue only: the $userId branch above powers the
            // Verification tab on a single 360 profile, where seeing that someone
            // began an application and abandoned it IS the useful signal.
            $query->where('status', '!=', 'draft');
            $this->hideVerifiedApplicants($query);
        }

        if ($category = $request->get('category')) {
            $query->where('category', $category);
        }

        if ($country = $request->get('country')) {
            $query->where('country', $country);
        }

        if ($from = $request->get('from')) {
            $query->whereDate('created_at', '>=', $from);
        }
        if ($to = $request->get('to')) {
            $query->whereDate('created_at', '<=', $to);
        }

        if ($q = $request->get('q')) {
            // Grouped, or the OR would escape the whereHas and match every row once one
            // user matched on email.
            $query->whereHas('user', fn ($b) =>
                $b->where(fn ($w) =>
                    $w->where('name', 'ilike', "%{$q}%")
                      ->orWhere('username', 'ilike', "%{$q}%")
                      ->orWhere('email', 'ilike', "%{$q}%")
                )
            );
        }

        $paginator = $query->paginate((int) $request->get('per_page', 10));

        // Counts run through the SAME filter as the list. If they didn't, the Pending
        // tab would read "1" above an empty table - the badge promising work that the
        // list then refuses to show.
        $countBase = fn () => $userId
            ? VerificationRequest::query()->where('user_id', (int) $userId)
            : $this->hideVerifiedApplicants(
                VerificationRequest::query()->where('status', '!=', 'draft')
            );

        // A revoked badge keeps status='approved' on purpose - the application WAS
        // approved and that is history worth keeping. But rendering it as a green
        // "Approved" chip next to a user who visibly has no badge reads as a bug in
        // the panel, so surface the revocation as its own state for display.
        // revoked_at is the authority here (not user.is_verified), because a user can
        // also lose the badge by expiry, and those are different things.
        $items = collect($paginator->items())->map(function ($r) {
            $r->is_revoked = $r->revoked_at !== null;
            if ($r->is_revoked) {
                $r->status = 'revoked';
            }
            return $r;
        })->all();

        $counts = [
            'pending'  => $countBase()->where('status', 'pending')->count(),
            // Approved counts only badges still standing; a revoked one is reported
            // separately rather than inflating the approved figure.
            'approved' => $countBase()->where('status', 'approved')->whereNull('revoked_at')->count(),
            'revoked'  => $countBase()->where('status', 'approved')->whereNotNull('revoked_at')->count(),
            'rejected' => $countBase()->where('status', 'rejected')->count(),
            'total'    => $countBase()->count(),
        ];

        // Top countries among applicants. Rows with no country are skipped rather than
        // bucketed as "Unknown" - country is optional on the request, and a fat Unknown
        // bar tells the reviewer nothing.
        $topCountries = VerificationRequest::query()
            ->whereNotNull('country')
            ->where('country', '!=', '')
            ->selectRaw('country, COUNT(*) as total')
            ->groupBy('country')
            ->orderByDesc('total')
            ->limit(5)
            ->get();

        $countryTotal = max(1, (int) $topCountries->sum('total'));

        return response()->json([
            'success' => true,
            'data'    => $items,
            'counts'  => $counts,
            'top_countries' => $topCountries->map(fn ($r) => [
                'country' => $r->country,
                'total'   => (int) $r->total,
                'pct'     => round(($r->total / $countryTotal) * 100, 1),
            ])->all(),
            'meta'    => [
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
                'total'        => $paginator->total(),
                'per_page'     => $paginator->perPage(),
            ],
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $req = VerificationRequest::with(['user', 'reviewer:id,name'])->findOrFail($id);
        return response()->json(['success' => true, 'data' => $req]);
    }

    /**
     * Approve, in one of two modes.
     *
     *  - subscription (default): a paid Blue Verified badge. Runs for one plan period
     *    from today; the creator renews to keep it.
     *  - permanent: staff, official and system accounts. No plan, no renewal, no expiry.
     *
     * Defaulting to `subscription` is deliberate. A missing or malformed `mode` must
     * never quietly hand out a badge that never expires - the safe failure here is the
     * one that comes up for review again.
     */
    public function approve(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'mode'         => ['nullable', 'string', 'in:subscription,permanent'],
            'notify_app'   => ['nullable', 'boolean'],
            'notify_email' => ['nullable', 'boolean'],
        ]);

        $req = VerificationRequest::with('user')->findOrFail($id);

        // PAYMENT GATE, re-checked here rather than trusted from submit time.
        // Blue Verified (purpose=badge, the default) is a paid subscription;
        // an identity-only request (purpose=identity) is free by design (see
        // VerificationController::submitReview()'s own gate/comment: "grants
        // no tick") and must never grant the badge. Enforced here on the
        // SERVER, independent of submitReview()'s own gate, because a request
        // sitting at status=pending does not by itself prove it was paid for
        // - the legacy /verification/apply endpoint used to create exactly
        // such a request with no payment check anywhere in its path.
        $isBadgeRequest = $req->purpose !== VerificationRequest::PURPOSE_IDENTITY;
        if ($isBadgeRequest) {
            $paid = VerificationPayment::where('verification_request_id', $req->id)
                ->where('purpose', VerificationPayment::PURPOSE_APPLICATION)
                ->paid()
                ->exists();
            if (! $paid) {
                return response()->json([
                    'success' => false,
                    'message' => 'This request has no paid verification payment on file - it cannot be approved as a Blue Verified badge.',
                ], 422);
            }
        }

        $permanent = $request->input('mode') === VerificationRequest::MODE_PERMANENT;

        $wasRevoked = $req->isRevoked();

        // Identity verification is a requirement on four programmes -
        // unlock them the moment it is granted, with no application.
        SyncCreatorMonetization::dispatch($req->user_id);

        $req->update([
            'status'       => 'approved',
            'reviewed_by'  => $request->user()->id,
            'reviewed_at'  => now(),
            'is_permanent' => $permanent,
            // Stored, not derived at read time - deriving it would silently move every
            // creator's renewal date the day we touch the plan table.
            'expires_at'   => $permanent
                ? null
                : now()->addMonths(VerificationRequest::planDurationMonths($req->plan_id)),

            // Re-approving a REVOKED badge restores it, so the revocation must be cleared
            // - otherwise isRevoked() stays true and the badge comes back already dead:
            // no renewal date, "Badge removed" still on the page, and a Renew button the
            // server would refuse. The revocation lives on in the admin action log, which
            // is where the audit trail belongs.
            'revoked_at'    => null,
            'revoke_reason' => null,
            'revoked_by'    => null,
        ]);

        // Only a badge-purpose (and now payment-verified) approval grants the
        // visible tick - an identity-only approval satisfies the monetization
        // requirement (via SyncCreatorMonetization above) without granting
        // anything that was meant to be paid for.
        if ($isBadgeRequest) {
            $req->user->forceFill(['is_verified' => true])->save();
        }

        // A restore and a first approval are different events, and the log should not
        // pretend otherwise - "approved" on an account that already had the badge taken
        // away hides the interesting half of the story.
        $verb = $wasRevoked ? 'Restored' : 'Approved';

        AdminActionLog::record(
            admin: $request->user(),
            action: $wasRevoked ? 'restore_verification' : 'approve_verification',
            target: $req,
            description: $permanent
                ? "{$verb} PERMANENT verification for @{$req->user->username} (no billing)"
                : "{$verb} verification for @{$req->user->username} until {$req->expires_at?->toDateString()}",
        );

        $this->tellUser(
            user:        $req->user,
            actionType:  'verification_approved',
            actionLabel: $wasRevoked ? 'Verification restored' : 'Verification approved',
            description: $wasRevoked
                ? ($permanent
                    ? 'Your Teezer verification badge has been restored. It is permanent - there is nothing to renew.'
                    : 'Your Teezer verification badge has been restored. It is active until '
                      . $req->expires_at?->format('F j, Y') . '.')
                : ($permanent
                    ? 'Your Teezer verification has been approved. Your badge is permanent - there is nothing to renew.'
                    : 'Your Teezer verification has been approved. Your badge is active until '
                      . $req->expires_at?->format('F j, Y') . ', after which it renews with your plan.'),
            inApp:       $request->boolean('notify_app', true),
            byEmail:     $request->boolean('notify_email', true),
        );

        return response()->json([
            'success' => true,
            'message' => $wasRevoked
                ? 'Verification badge restored.'
                : ($permanent
                    ? 'Permanent verification granted. This badge does not expire.'
                    : 'Verification approved.'),
        ]);
    }

    /**
     * Take a badge back after it was granted.
     *
     * Recorded as a REVOCATION, not by resetting the status to `rejected`. Those are
     * different events - one says "we never granted this", the other says "we granted it
     * and then withdrew it" - and flattening them would erase the fact that the badge was
     * ever live, which is precisely what an audit would go looking for.
     *
     * The reason is required, because the user is shown it.
     */
    public function revoke(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'reason'       => ['required', 'string', 'max:500'],
            'notify_app'   => ['nullable', 'boolean'],
            'notify_email' => ['nullable', 'boolean'],
        ]);

        $req = VerificationRequest::with('user')->findOrFail($id);

        if ($req->status !== 'approved') {
            return response()->json([
                'success' => false,
                'message' => 'Only an approved badge can be revoked.',
            ], 422);
        }

        if ($req->isRevoked()) {
            return response()->json([
                'success' => false,
                'message' => 'This badge has already been revoked.',
            ], 422);
        }

        $req->update([
            'revoked_at'    => now(),
            'revoke_reason' => $request->string('reason')->toString(),
            'revoked_by'    => $request->user()->id,
        ]);

        // The badge itself lives on the user - the request row is only the paperwork.
        $req->user->forceFill(['is_verified' => false])->save();

        AdminActionLog::record(
            admin: $request->user(),
            action: 'revoke_verification',
            target: $req,
            description: "Revoked verification for @{$req->user->username}: {$request->input('reason')}",
        );

        $this->tellUser(
            user:        $req->user,
            actionType:  'verification_revoked',
            actionLabel: 'Verification removed',
            description: 'Your Teezer verification badge has been removed.',
            inApp:       $request->boolean('notify_app', true),
            byEmail:     $request->boolean('notify_email', true),
            note:        $request->input('reason'),
        );

        return response()->json(['success' => true, 'message' => 'Verification badge removed.']);
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'rejection_reason' => ['required', 'string', 'max:500'],
            'notify_app'       => ['nullable', 'boolean'],
            'notify_email'     => ['nullable', 'boolean'],
        ]);

        $req = VerificationRequest::with('user')->findOrFail($id);

        $req->update([
            'status'           => 'rejected',
            'rejection_reason' => $request->rejection_reason,
            'reviewed_by'      => $request->user()->id,
            'reviewed_at'      => now(),
        ]);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'reject_verification',
            target: $req,
            description: "Rejected verification for @{$req->user->username}: {$request->rejection_reason}",
        );

        $this->tellUser(
            user:        $req->user,
            actionType:  'verification_rejected',
            actionLabel: 'Verification not approved',
            description: 'Your Teezer verification application was not approved. You can fix the issue below and apply again.',
            inApp:       $request->boolean('notify_app', true),
            byEmail:     $request->boolean('notify_email', true),
            // The reason goes in the note, verbatim. It is the only part of this email
            // that tells them what to actually do.
            note:        $request->rejection_reason,
        );

        return response()->json(['success' => true, 'message' => 'Verification rejected.']);
    }
}
