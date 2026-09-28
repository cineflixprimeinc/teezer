<?php

use Illuminate\Support\Str;

return [
    'default' => env('DB_CONNECTION', 'mysql'),

    'connections' => [
        'sqlite' => [
            'driver' => 'sqlite',
            'url' => env('DB_URL'),
            'database' => env('DB_DATABASE', database_path('database.sqlite')),
            'prefix' => '',
            'foreign_key_constraints' => env('DB_FOREIGN_KEYS', true),
            'busy_timeout' => null,
            'journal_mode' => null,
            'synchronous' => null,
        ],

        'mysql' => [
            'driver' => 'mysql',
            'url' => env('DB_URL'),
            'host' => env('DB_HOST', '127.0.0.1'),
            'port' => env('DB_PORT', '3306'),
            // Read/write split for the two-VPS setup: on VPS-2, reads hit the
            // LOCAL MySQL replica (fast) while writes go to the primary over the
            // SSH tunnel. When DB_READ_*/DB_WRITE_* are unset (e.g. VPS-1) both
            // fall back to DB_HOST/DB_PORT, so it behaves as a normal single host.
            'read' => [
                'host' => [env('DB_READ_HOST', env('DB_HOST', '127.0.0.1'))],
                'port' => env('DB_READ_PORT', env('DB_PORT', '3306')),
            ],
            'write' => [
                'host' => [env('DB_WRITE_HOST', env('DB_HOST', '127.0.0.1'))],
                'port' => env('DB_WRITE_PORT', env('DB_PORT', '3306')),
            ],
            // Once a request performs a write, keep its subsequent reads on the
            // primary so users always see data they just created (no lag misses).
            'sticky' => true,
            'database' => env('DB_DATABASE', 'teezer'),
            'username' => env('DB_USERNAME', 'root'),
            'password' => env('DB_PASSWORD', ''),
            'unix_socket' => env('DB_SOCKET', ''),
            'charset' => env('DB_CHARSET', 'utf8mb4'),
            'collation' => env('DB_COLLATION', 'utf8mb4_unicode_ci'),
            'prefix' => '',
            'prefix_indexes' => true,
            'strict' => true,
            'engine' => 'InnoDB',
            'options' => extension_loaded('pdo_mysql') ? array_filter([
                PDO::MYSQL_ATTR_SSL_CA => env('MYSQL_ATTR_SSL_CA'),
            ]) : [],
        ],

        'pgsql' => [
            'driver' => 'pgsql',
            'url' => env('DB_PGSQL_URL'),
            'host' => env('DB_PGSQL_HOST', '127.0.0.1'),
            'port' => env('DB_PGSQL_PORT', '5432'),
            // Mirrors the mysql read/write split: reads can hit a local replica,
            // writes go to the primary. When DB_PGSQL_READ_*/WRITE_* are unset both
            // fall back to DB_PGSQL_HOST/PORT, so it behaves as a single host.
            'read' => [
                'host' => [env('DB_PGSQL_READ_HOST', env('DB_PGSQL_HOST', '127.0.0.1'))],
                'port' => env('DB_PGSQL_READ_PORT', env('DB_PGSQL_PORT', '5432')),
            ],
            'write' => [
                'host' => [env('DB_PGSQL_WRITE_HOST', env('DB_PGSQL_HOST', '127.0.0.1'))],
                'port' => env('DB_PGSQL_WRITE_PORT', env('DB_PGSQL_PORT', '5432')),
            ],
            // Keep post-write reads on the primary so users see their own writes.
            'sticky' => true,
            'database' => env('DB_PGSQL_DATABASE', 'teezer'),
            'username' => env('DB_PGSQL_USERNAME', 'teezer'),
            'password' => env('DB_PGSQL_PASSWORD', ''),
            'charset' => env('DB_PGSQL_CHARSET', 'utf8'),
            'prefix' => '',
            'prefix_indexes' => true,
            'search_path' => env('DB_PGSQL_SEARCH_PATH', 'public'),
            'sslmode' => env('DB_PGSQL_SSLMODE', 'prefer'),
            // Required for PgBouncer transaction-mode pooling: native PDO prepared
            // statements use server-side PREPARE/DEALLOCATE which fails when
            // PgBouncer reassigns connections between transactions.
            'options' => [
                \PDO::ATTR_EMULATE_PREPARES => true,
            ],
        ],
    ],

    'migrations' => [
        'table' => 'migrations',
        'update_date_on_publish' => true,
    ],

    'redis' => [
        'client' => env('REDIS_CLIENT', 'phpredis'),
        'options' => [
            'cluster' => env('REDIS_CLUSTER', 'redis'),
            'prefix' => env('REDIS_PREFIX', Str::slug(env('APP_NAME', 'laravel'), '_').'_database_'),
        ],
        'default' => [
            'url' => env('REDIS_URL'),
            'host' => env('REDIS_HOST', '127.0.0.1'),
            'username' => env('REDIS_USERNAME'),
            'password' => env('REDIS_PASSWORD'),
            'port' => env('REDIS_PORT', '6379'),
            'database' => env('REDIS_DB', '0'),
        ],
        'cache' => [
            'url' => env('REDIS_URL'),
            'host' => env('REDIS_HOST', '127.0.0.1'),
            'username' => env('REDIS_USERNAME'),
            'password' => env('REDIS_PASSWORD'),
            'port' => env('REDIS_PORT', '6379'),
            'database' => env('REDIS_CACHE_DB', '1'),
        ],

        /*
        |--------------------------------------------------------------------------
        | analytics - the ClickHouse event stream, UNPREFIXED
        |--------------------------------------------------------------------------
        | Laravel prefixes every Redis key with 'reelsoo_database_'. That is fine for
        | keys only Laravel reads, but this stream is written by PHP and consumed by
        | the GO backend (backend-go/internal/clickhouse/drain.go), which is not a
        | Laravel app and knows nothing about the prefix.
        |
        | Without this connection, PHP writes 'reelsoo_database_analytics:events' and
        | Go reads 'analytics:events' - two different keys. Nothing errors: phpredis
        | happily XADDs to the prefixed key and reports success, Go sits on an empty
        | stream, and the events simply pile up in Redis until MAXLEN trims them away.
        | A pipeline that looks healthy from both ends and moves nothing.
        |
        | An empty prefix makes the key literally what both sides expect.
        */
        'analytics' => [
            'url' => env('REDIS_URL'),
            'host' => env('REDIS_HOST', '127.0.0.1'),
            'username' => env('REDIS_USERNAME'),
            'password' => env('REDIS_PASSWORD'),
            'port' => env('REDIS_PORT', '6379'),
            'database' => env('REDIS_DB', '0'),
            'options' => ['prefix' => ''],
        ],
    ],
];
