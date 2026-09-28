<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\VerificationRequest;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VerificationController extends Controller
{
    public function __construct(private readonly StorageService $storage) {}

    /* ── GET /verification ─────────────────────────────────────────────────── */
    public function status(Request $request): JsonResponse
    {
        $user = $request->user();

        $latest = VerificationRequest::where('user_id', $user->id)
            ->latest()
            ->first();

        return response()->json([
            'success' => true,
            // is_verified lives on the USER, and is the only thing that actually decides
            // whether a badge renders anywhere in the product. A request row can say
            // "approved" while an admin has since revoked the badge, so the clients must
            // trust this flag rather than inferring verification from status alone.
            'is_verified' => (bool) $user->is_verified,

            /*
             * What each plan actually costs, from the same constant the charge is
             * taken against.
             *
             * The clients used to carry their own copy of this as display strings
             * ("$5", "$10", "$20"). PLAN_PRICES already says it is the one that
             * decides what gets charged, so a client copy can only ever agree with
             * it by luck - and the failure mode is a plan card advertising a price
             * the store does not charge. Sent with the status the page already
             * loads, so reading it costs no extra request.
             */
            'plans' => collect(['basic', 'plus', 'business'])
                ->map(fn ($id) => [
                    'id'        => $id,
                    'price_usd' => \App\Models\VerificationPayment::priceFor($id),
                ])
                ->values(),

            'data'    => $latest ? [
                'id'                      => $latest->id,
                'status'                  => $latest->status,
                'verification_step'       => $latest->verification_step,
                'plan_id'                 => $latest->plan_id,

                // Renewal. Null for a PERMANENT badge (nothing to renew) and null for one
                // approved before expiry was tracked (we don't know). Those are different
                // facts, so `is_permanent` is sent alongside - without it the clients
                // could not tell "never expires" from "we lost the date", and would have
                // to guess which reassurance to show.
                'expires_at'              => $latest->renewsAt()?->toIso8601String(),
                'has_lapsed'              => $latest->hasLapsed(),
                'is_permanent'            => $latest->isPermanent(),

                // A badge that was granted and then taken back. The user is shown the
                // reason verbatim - they were told by email and in-app, and the page they
                // land on must not contradict that by still saying "Verified".
                'is_revoked'              => $latest->isRevoked(),
                'revoke_reason'           => $latest->revoke_reason,

                // Whether Renew is allowed RIGHT NOW. Derived here rather than in each
                // client, so the button and the endpoint can never disagree about the
                // window - the surest way to ship a button that 422s the moment it's
                // pressed is to let two codebases each decide when to show it.
                'can_renew'               => $this->canRenew($latest, (bool) $user->is_verified),
                'renew_window_days'       => self::RENEW_WINDOW_DAYS,

                // Payment for THIS application. `is_paid` is what unlocks Submit, and the
                // server checks it again on submit - this field only decides which screen
                // to show, never whether the rule is enforced.
                'is_paid'                 => \App\Models\VerificationPayment::where('verification_request_id', $latest->id)
                                                ->where('purpose', \App\Models\VerificationPayment::PURPOSE_APPLICATION)
                                                ->paid()
                                                ->exists(),
                'plan_price_usd'          => \App\Models\VerificationPayment::priceFor($latest->plan_id),
                'category'                => $latest->category,
                'full_name'               => $latest->full_name,
                'phone'                   => $latest->phone,
                'brand_name'              => $latest->brand_name,
                'social_links'            => $latest->social_links,
                'website'                 => $latest->website,
                'country'                 => $latest->country,
                'reason'                  => $latest->reason,
                'rejection_reason'        => $latest->rejection_reason,
                'submitted_at'            => $latest->created_at->toIso8601String(),
                'reviewed_at'             => $latest->reviewed_at?->toIso8601String(),
                'document_uploaded'       => !empty($latest->document_url),
                'selfie_uploaded'         => !empty($latest->selfie_url),
                'supporting_doc_uploaded' => !empty($latest->supporting_doc_url),
            ] : null,
        ]);
    }

    /**
     * How close to the renewal date the Renew button appears.
     *
     * Also enforced SERVER-side, not just hidden in the UI - a button you can't see is
     * not a rule, and this endpoint extends a badge.
     */
    public const RENEW_WINDOW_DAYS = 10;

    /** The single definition of "renewable now". Used by both status() and renew(). */
    private function canRenew(VerificationRequest $req, bool $isVerified): bool
    {
        if (! $isVerified || $req->status !== 'approved') return false;
        if ($req->isRevoked() || $req->isPermanent())     return false;
        if (! $req->expires_at)                           return false;

        // Lapsed badges are always renewable; live ones only inside the window.
        return $req->expires_at->isPast()
            || now()->diffInDays($req->expires_at, false) <= self::RENEW_WINDOW_DAYS;
    }

    /* ── POST /verification/renew ──────────────────────────────────────────── */

    /**
     * Extend a subscription badge by one plan period.
     *
     * NOTE, because it matters and is easy to misread: this takes NO PAYMENT. Nothing in
     * the Blue Verified flow does - `select-plan` doesn't charge either, it only records
     * which plan was chosen. So renewing is exactly as free as being approved in the
     * first place, and this endpoint is not a checkout pretending to be one. When
     * billing is wired up, this is the single place that has to change.
     */
    public function renew(Request $request): JsonResponse
    {
        $user = $request->user();

        $req = VerificationRequest::where('user_id', $user->id)
            ->where('status', 'approved')
            ->latest()
            ->first();

        if (! $req || ! $user->is_verified) {
            return response()->json(['success' => false, 'message' => 'You do not have an active verification badge.'], 422);
        }

        if ($req->isRevoked()) {
            return response()->json(['success' => false, 'message' => 'This badge was removed and cannot be renewed.'], 422);
        }

        if ($req->isPermanent()) {
            return response()->json(['success' => false, 'message' => 'Your badge is permanent. There is nothing to renew.'], 422);
        }

        if (! $req->expires_at) {
            return response()->json(['success' => false, 'message' => 'This badge has no renewal date on record.'], 422);
        }

        // Same predicate the status endpoint uses to decide whether to SHOW the button.
        // One definition, so the button can never be offered for a renewal the server
        // will then refuse.
        if (! $this->canRenew($req, (bool) $user->is_verified)) {
            return response()->json([
                'success' => false,
                'message' => 'Too early to renew. You can renew within '
                    . self::RENEW_WINDOW_DAYS . ' days of your renewal date.',
            ], 422);
        }

        // Extend from the CURRENT expiry when it is still in the future, so renewing
        // early doesn't cost the creator the days they already have. From today when it
        // has already lapsed, so a badge left dormant for a year doesn't come back
        // already expired.
        $base = $req->expires_at->isFuture() ? $req->expires_at : now();

        $req->update([
            'expires_at' => $base->copy()->addMonths(
                VerificationRequest::planDurationMonths($req->plan_id),
            ),
        ]);

        return response()->json([
            'success'    => true,
            'message'    => 'Your Blue Verified badge has been renewed.',
            'expires_at' => $req->expires_at->toIso8601String(),
        ]);
    }

    /* ── POST /verification/select-plan ────────────────────────────────────── */
    /**
     * POST /verification/identity/start
     *
     * Begins a FREE identity check - the ID review a creator needs to satisfy
     * the "identity verified" requirement on a monetization programme.
     *
     * Deliberately not a plan: there is no plan_id, no payment and no tick at
     * the end of it. It jumps straight to `account_checked` because the two
     * steps it skips - choosing a plan and the account review - exist to sell
     * and gate a badge, and this is neither.
     *
     * A creator who already has a badge application in flight keeps it; the two
     * are separate records with separate purposes and must not clobber each
     * other.
     */
    public function startIdentity(Request $request): JsonResponse
    {
        $user = $request->user();

        // Already identity-verified, by either route? Nothing to start.
        if ($user->is_verified) {
            return response()->json([
                'success' => true,
                'message' => 'Your identity is already verified.',
            ]);
        }

        $draft = VerificationRequest::where('user_id', $user->id)
            ->where('purpose', VerificationRequest::PURPOSE_IDENTITY)
            ->whereIn('status', ['draft', 'rejected'])
            ->latest()
            ->first();

        if ($draft) {
            // Re-entering an in-progress check must not wipe documents already
            // uploaded - the same mistake the badge flow had to fix.
            $draft->update([
                'status'            => 'draft',
                'verification_step' => $draft->verification_step ?: 'account_checked',
                'rejection_reason'  => null,
            ]);
        } else {
            $draft = VerificationRequest::create([
                'user_id'           => $user->id,
                'purpose'           => VerificationRequest::PURPOSE_IDENTITY,
                'plan_id'           => null,
                'status'            => 'draft',
                'verification_step' => 'account_checked',
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Identity check started. Upload your ID and a selfie to continue.',
            'data'    => ['id' => $draft->id, 'verification_step' => $draft->verification_step],
        ]);
    }

    public function selectPlan(Request $request): JsonResponse
    {
        $request->validate([
            'plan_id' => ['required', 'in:basic,plus,business,monthly,annual'],
        ]);

        $user = $request->user();

        // Block if already approved or pending.
        //
        // A REVOKED approval is not "active": the row still reads `approved` (on purpose -
        // that's how we keep the fact the badge once existed), but the badge is gone. Left
        // unhandled, this told a creator whose badge had just been taken away that their
        // "account is already verified" and refused to let them apply again - a dead end
        // with a message that flatly contradicted their own page.
        $active = VerificationRequest::where('user_id', $user->id)
            ->whereIn('status', ['pending', 'approved'])
            ->latest()
            ->first();

        if ($active?->status === 'approved' && ! $active->isRevoked()) {
            return response()->json(['success' => false, 'message' => 'Your account is already verified.'], 422);
        }
        if ($active?->status === 'pending') {
            return response()->json(['success' => false, 'message' => 'You already have a pending verification request.'], 422);
        }

        // Reuse an existing draft or rejected record, otherwise create fresh
        $draft = VerificationRequest::where('user_id', $user->id)
            ->whereIn('status', ['draft', 'rejected'])
            ->latest()
            ->first();

        if ($draft) {
            // Only a genuine RESTART wipes the uploaded documents: a different plan, or
            // re-applying after a rejection.
            //
            // Re-selecting the SAME plan is what happens when someone simply steps back
            // through the wizard to look at their choice. That used to clear their ID and
            // selfie and knock them back to step 1 - destroying work they had already
            // done, for pressing Back. Now it is a no-op on their progress.
            $isRestart = $draft->status === 'rejected' || $draft->plan_id !== $request->plan_id;

            if ($isRestart) {
                $draft->update([
                    'plan_id'           => $request->plan_id,
                    'verification_step' => 'plan_selected',
                    'status'            => 'draft',
                    'document_url'      => null,
                    'document_key'      => null,
                    'selfie_url'        => null,
                    'selfie_key'        => null,
                    'supporting_doc_url'  => null,
                    'supporting_doc_key'  => null,
                    'social_links'        => null,
                    'website'             => null,
                    'rejection_reason'    => null,
                ]);
            } else {
                $draft->update([
                    'status'            => 'draft',
                    'verification_step' => $draft->verification_step ?: 'plan_selected',
                ]);
            }
        } else {
            VerificationRequest::create([
                'user_id'           => $user->id,
                'plan_id'           => $request->plan_id,
                'status'            => 'draft',
                'verification_step' => 'plan_selected',
            ]);
        }

        return response()->json(['success' => true, 'message' => 'Plan selected. Proceeding to Account Review.']);
    }

    /* ── POST /verification/account-check ─────────────────────────────────── */
    public function accountCheck(Request $request): JsonResponse
    {
        $user = $request->user();

        $draft = VerificationRequest::where('user_id', $user->id)
            ->where('status', 'draft')
            // documents_uploaded is accepted so the step can be re-run by someone who
            // stepped BACK through the wizard. Re-running it is idempotent - it only
            // reads the account and advances the step - so there is no reason to 422
            // someone for reviewing a page they have already passed.
            ->whereIn('verification_step', ['plan_selected', 'account_checked', 'documents_uploaded'])
            ->latest()
            ->first();

        if (! $draft) {
            return response()->json(['success' => false, 'message' => 'No active plan selected. Please choose a plan first.'], 422);
        }

        $checks = [];

        // 1. Blue Verified subscription (plan selected = active for now)
        $checks[] = [
            'key'    => 'subscription',
            'label'  => 'Blue Verified subscription',
            'status' => 'passed',
            'detail' => null,
        ];

        // 2. Profile completeness - avatar + name + username (warning only, not a hard blocker)
        $profileComplete = !empty($user->avatar) && !empty($user->name) && !empty($user->username);
        $checks[] = [
            'key'    => 'profile_completeness',
            'label'  => 'Profile completeness',
            'status' => $profileComplete ? 'passed' : 'pending',
            'detail' => $profileComplete ? null : 'Tip: Add a profile photo and display name to strengthen your application.',
        ];

        // 3. Account authenticity
        $checks[] = [
            'key'    => 'account_authenticity',
            'label'  => 'Account authenticity',
            'status' => 'passed',
            'detail' => null,
        ];

        // 4. Community guidelines
        $noViolation = !($user->has_violation ?? false);
        $checks[] = [
            'key'    => 'community_guidelines',
            'label'  => 'Community guidelines',
            'status' => $noViolation ? 'passed' : 'failed',
            'detail' => $noViolation ? null : 'Active policy violation on your account.',
        ];

        // 5. Content & activity
        $checks[] = [
            'key'    => 'content_activity',
            'label'  => 'Content & activity review',
            'status' => 'passed',
            'detail' => null,
        ];

        // 6. Public presence (pending - user provides in upload step)
        $checks[] = [
            'key'    => 'public_presence',
            'label'  => 'Public presence',
            'status' => 'pending',
            'detail' => 'You will provide this in the next step.',
        ];

        // 7. Identity verification readiness
        $checks[] = [
            'key'    => 'identity_readiness',
            'label'  => 'Identity verification readiness',
            'status' => 'ready',
            'detail' => null,
        ];

        // Only community_guidelines is a hard blocker; all other checks are warnings
        $hardBlocked = collect($checks)->filter(
            fn ($c) => $c['key'] === 'community_guidelines' && $c['status'] === 'failed'
        )->count() > 0;

        $canProceed = ! $hardBlocked;

        // Advance, never REGRESS. Someone who stepped back from step 4 to re-read their
        // account review is already past this point - resetting them to
        // account_checked would throw away the documents_uploaded marker and force them
        // to re-upload files the server is already holding.
        if ($draft->verification_step === 'plan_selected') {
            $draft->update(['verification_step' => 'account_checked']);
        }

        return response()->json([
            'success'     => true,
            'can_proceed' => $canProceed,
            'checks'      => $checks,
        ]);
    }

    /* ── POST /verification/upload-documents ───────────────────────────────── */
    public function uploadDocuments(Request $request): JsonResponse
    {
        $request->validate([
            'document'       => ['required', 'file', 'max:10240', 'mimes:pdf,jpeg,jpg,png,webp'],
            'selfie'         => ['required', 'file', 'max:10240', 'mimes:jpeg,jpg,png,webp'],
            'supporting_doc' => ['nullable', 'file', 'max:10240', 'mimes:pdf,jpeg,jpg,png,webp'],
            'social_links'   => ['nullable', 'string'],
            'website'        => ['nullable', 'string', 'max:500'],
        ]);

        $user = $request->user();

        $draft = VerificationRequest::where('user_id', $user->id)
            ->where('status', 'draft')
            // documents_uploaded is accepted so documents can be REPLACED. Uploading a
            // blurry ID and then wanting to swap it is the single most predictable thing
            // a user does here, and requiring exactly `account_checked` made that a 422:
            // the first upload moved you past the only step from which uploading was
            // allowed.
            ->whereIn('verification_step', ['account_checked', 'documents_uploaded'])
            ->latest()
            ->first();

        if (! $draft) {
            return response()->json(['success' => false, 'message' => 'Account check not completed. Please complete account review first.'], 422);
        }

        $documentKey = $this->storage->storeDocument($request->file('document'));
        $documentUrl = $this->storage->url($documentKey);

        $selfieKey = $this->storage->storeDocument($request->file('selfie'));
        $selfieUrl = $this->storage->url($selfieKey);

        $supportingDocKey = null;
        $supportingDocUrl = null;
        if ($request->hasFile('supporting_doc')) {
            $supportingDocKey = $this->storage->storeDocument($request->file('supporting_doc'));
            $supportingDocUrl = $this->storage->url($supportingDocKey);
        }

        $socialLinks = null;
        if ($request->social_links) {
            try {
                $decoded = json_decode($request->social_links, true);
                $socialLinks = is_array($decoded) ? $decoded : null;
            } catch (\Exception) {}
        }

        $draft->update([
            'document_url'        => $documentUrl,
            'document_key'        => $documentKey,
            'selfie_url'          => $selfieUrl,
            'selfie_key'          => $selfieKey,
            'supporting_doc_url'  => $supportingDocUrl,
            'supporting_doc_key'  => $supportingDocKey,
            'social_links'        => $socialLinks,
            'website'             => $request->website,
            'verification_step'   => 'documents_uploaded',
        ]);

        return response()->json(['success' => true, 'message' => 'Documents uploaded. Please review and submit.']);
    }

    /* ── POST /verification/submit ─────────────────────────────────────────── */
    public function submitReview(Request $request): JsonResponse
    {
        $user = $request->user();

        $draft = VerificationRequest::where('user_id', $user->id)
            ->where('status', 'draft')
            ->where('verification_step', 'documents_uploaded')
            ->latest()
            ->first();

        if (! $draft) {
            return response()->json(['success' => false, 'message' => 'Please complete all previous steps first.'], 422);
        }

        if (empty($draft->document_url) || empty($draft->selfie_url)) {
            return response()->json(['success' => false, 'message' => 'Required documents are missing.'], 422);
        }

        /* PAYMENT GATE - badge applications only.
           An `identity` request buys nothing: it is an ID review a creator needs
           to satisfy a monetization requirement, and charging for that would put
           a subscription between them and their own earnings. It grants no tick,
           so nothing paid-for is being given away.

           Still enforced on the SERVER for the badge case, and not merely by
           hiding the Submit button. A button you can't see is not a rule -
           anyone can POST here directly. */
        if ($draft->purpose === VerificationRequest::PURPOSE_IDENTITY) {
            $draft->update(['status' => 'pending']);

            return response()->json([
                'success' => true,
                'message' => 'Identity check submitted. Our team will review within 3-5 business days.',
            ]);
        }

        // PAYMENT GATE. Blue Verified is a subscription, so an application cannot enter
        // the review queue unpaid.
        //
        // Enforced here, on the SERVER, and not merely by hiding the Submit button. A
        // button you can't see is not a rule - anyone can POST to this endpoint directly,
        // and "the UI wouldn't let you" is not a payment system.
        $paid = \App\Models\VerificationPayment::where('verification_request_id', $draft->id)
            ->where('purpose', \App\Models\VerificationPayment::PURPOSE_APPLICATION)
            ->paid()
            ->exists();

        if (! $paid) {
            return response()->json([
                'success'         => false,
                'message'         => 'Payment is required before you can submit your application.',
                'payment_required'=> true,
            ], 402);
        }

        $draft->update(['status' => 'pending']);

        return response()->json([
            'success' => true,
            'message' => 'Verification request submitted. Our team will review within 3–5 business days.',
        ]);
    }

    /*
     * ── POST /verification/apply  (legacy single-step flow) ────────────────
     *
     * Retired: created a `pending` VerificationRequest (purpose defaults to
     * `badge` at the DB level) with no payment check anywhere in this method -
     * unlike the current select-plan -> account-check -> upload-documents ->
     * payment -> submit flow, whose submitReview() explicitly gates entry to
     * `pending` on a paid VerificationPayment existing. That let a normal
     * account get a paid Blue Verified badge approved for free.
     *
     * Confirmed unused by both live clients before retiring it: the frontend
     * defines a `verificationApply` service method with zero call sites
     * anywhere else in the app, and mobile has no reference to this route at
     * all. Left in place (rather than removed) so a stray caller gets this
     * explicit message instead of a bare 404/500, and so it stays trivial to
     * point at the new flow instead if something still needs it.
     */
    public function apply(Request $request): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'This verification method is no longer available. Please use the current verification flow (select a plan, then submit for review).',
        ], 410);
    }
}
