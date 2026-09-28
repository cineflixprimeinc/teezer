<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * Thrown inside the withdrawal transaction when the locked wallet turns out not to
 * hold the requested amount. Throwing (rather than returning) is what rolls the
 * transaction back, so a failed check can never leave a partial decrement behind.
 */
class InsufficientBalanceException extends RuntimeException
{
}
