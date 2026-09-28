<?php

namespace App\Services\AppAttest;

use RuntimeException;

/**
 * A verification failure.
 *
 * The message is always a short, stable machine reason ("nonce_mismatch",
 * "chain_untrusted") and is for logs and metrics ONLY. It must never be
 * returned to the client: the whole point of an attestation check is that an
 * attacker cannot tell which of a dozen conditions they failed, because that
 * turns the endpoint into an oracle for probing the verifier. Callers return a
 * single generic error regardless of what is thrown here.
 */
class AppAttestException extends RuntimeException
{
}
