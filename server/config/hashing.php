<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Hash Driver
    |--------------------------------------------------------------------------
    | Password hashing algorithm. bcrypt (default) or argon2id ("argon2id").
    */

    'driver' => env('HASH_DRIVER', 'bcrypt'),

    /*
    |--------------------------------------------------------------------------
    | Bcrypt Options
    |--------------------------------------------------------------------------
    | Work factor (cost). 12 is the project minimum; raise it as hardware
    | improves. Existing hashes are transparently re-hashed on next login when
    | the cost changes (User model casts `password` => 'hashed').
    */

    'bcrypt' => [
        'rounds' => env('BCRYPT_ROUNDS', 12),
        'verify' => true,
        'limit'  => null,
    ],

    /*
    |--------------------------------------------------------------------------
    | Argon2id Options
    |--------------------------------------------------------------------------
    | Used when HASH_DRIVER=argon2id. OWASP-aligned parameters.
    */

    'argon' => [
        'memory'  => env('ARGON_MEMORY', 65536),
        'threads' => env('ARGON_THREADS', 1),
        'time'    => env('ARGON_TIME', 4),
        'verify'  => true,
    ],

];
