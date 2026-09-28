<?php

return [

    /*
     * Master switch. Off means the endpoints still exist but every verification
     * short-circuits to "unavailable" - nothing is stored, nothing is enforced.
     * Ships dark, exactly like the apivideo integration does.
     */
    'enabled' => env('APP_ATTEST_ENABLED', false),

    /*
     * Observe-only vs enforcing.
     *
     * FALSE (the default, and what should be deployed first): verification runs
     * in full and the outcome is logged and counted, but a failure never blocks
     * the request. This is the only safe way to turn it on - it surfaces how
     * many real users have unsupported devices, stale keys or clock skew before
     * any of them are locked out.
     *
     * TRUE: endpoints marked as requiring attestation reject unverified
     * requests. Read at request time (not baked into a build) precisely so
     * enforcement can be pulled back without shipping an app update.
     */
    'enforce' => env('APP_ATTEST_ENFORCE', false),

    /*
     * The App ID Apple binds every attestation to: "<TeamID>.<BundleID>".
     * These are checked against the attestation, never taken from the client.
     * Team id is shared with APNs, hence the fallback.
     */
    'team_id'   => env('APP_ATTEST_TEAM_ID', env('APNS_TEAM_ID')),
    'bundle_id' => env('APP_ATTEST_BUNDLE_ID', 'com.teezer.app'),

    /*
     * Which attestation environments are accepted.
     *
     * The environment is read out of the attestation's own aaguid, never from
     * the client, so this is a real gate rather than a hint: with only
     * "production" listed, a development build cannot attest against this
     * server no matter what it claims.
     *
     * All three build profiles point at the same production API (there is no
     * staging backend), so "development" has to be accepted for a dev/TestFlight
     * build to be testable at all. Drop it once rollout is finished if
     * development attestations should stop being honoured.
     */
    'environments' => array_filter(array_map(
        'trim',
        explode(',', (string) env('APP_ATTEST_ENVIRONMENTS', 'production,development')),
    )),

    /*
     * Apple's App Attest root. Public certificate, committed to the repo - it
     * is a trust anchor, not a secret, and pinning it in the image is the point:
     * fetching it at runtime would make the verification only as trustworthy as
     * whatever answered.
     */
    'root_ca' => env('APP_ATTEST_ROOT_CA', resource_path('certs/Apple_App_Attestation_Root_CA.pem')),

    /*
     * Challenge lifetime, seconds. Short by design: a challenge is single-use
     * and consumed within one round trip. Long enough to survive a slow mobile
     * network and Secure Enclave signing, nowhere near long enough to be worth
     * harvesting.
     */
    'challenge_ttl' => (int) env('APP_ATTEST_CHALLENGE_TTL', 300),

];
