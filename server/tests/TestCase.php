<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

/**
 * Laravel test bootstrap.
 *
 * The suite had none: every existing test extends PHPUnit's plain TestCase and
 * exercises pure classes (the ad auction, the fraud guard) that need no
 * framework. Anything that touches the database, the router or the container
 * needs a booted application, which is what this provides.
 *
 * Laravel 12 resolves the application from bootstrap/app.php itself, so this
 * only has to exist and name the namespace - there is no CreatesApplication
 * trait to pull in any more.
 */
abstract class TestCase extends BaseTestCase
{
    //
}
