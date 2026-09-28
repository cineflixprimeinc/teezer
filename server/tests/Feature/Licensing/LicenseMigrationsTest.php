<?php

namespace Tests\Feature\Licensing;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Runs the five licensing migrations against a real database engine and checks
 * that the schema they produce is the one the application code expects.
 *
 * Why this exists: these migrations will eventually run against a live
 * production database, and a mistake there is expensive. This catches the
 * boring, likely failures - a typo in a column name, a foreign key pointing at
 * a table that does not exist, a unique constraint that does not hold, a
 * down() that cannot undo its own up() - before any of that happens.
 *
 * The engine here is SQLite (phpunit.xml), not PostgreSQL. That is worth being
 * honest about: it exercises structure and constraints, not PostgreSQL-specific
 * behaviour. These migrations use only portable Blueprint methods for exactly
 * that reason, so the gap is small - but a green run here is not a substitute
 * for running `migrate` on a staging PostgreSQL before production.
 */
class LicenseMigrationsTest extends TestCase
{
    private const MIGRATIONS = [
        '2026_09_08_100001_create_purchase_codes_table',
        '2026_09_08_100002_create_licenses_table',
        '2026_09_08_100003_create_license_activations_table',
        '2026_09_08_100004_create_license_audit_logs_table',
        '2026_09_08_100005_create_license_releases_table',
    ];

    /** @var list<object> */
    private array $instances = [];

    protected function setUp(): void
    {
        parent::setUp();

        // The licensing tables carry foreign keys to `users`. Rather than run
        // all 353 application migrations to get one table, stand up the minimum
        // the constraints need.
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('username')->nullable();
        });

        foreach (self::MIGRATIONS as $name) {
            $migration = require database_path("migrations/{$name}.php");
            $migration->up();
            $this->instances[] = $migration;
        }
    }

    protected function tearDown(): void
    {
        // down() in reverse order, which also proves the rollback path works -
        // a migration whose down() cannot run is one that cannot be undone in
        // an incident.
        foreach (array_reverse($this->instances) as $migration) {
            $migration->down();
        }

        Schema::dropIfExists('users');

        parent::tearDown();
    }

    public function test_every_licensing_table_is_created(): void
    {
        foreach (['purchase_codes', 'licenses', 'license_activations', 'license_audit_logs', 'license_releases'] as $table) {
            $this->assertTrue(Schema::hasTable($table), "Missing table: {$table}");
        }
    }

    /**
     * The columns the application actually reads and writes. A drift between a
     * model's $fillable and its table is silent in Laravel until a write fails
     * in production.
     */
    public function test_licenses_table_has_the_columns_the_model_uses(): void
    {
        $expected = [
            'license_id', 'purchase_code_id', 'purchase_code_hash', 'purchase_code_last4',
            'license_key_hash', 'license_key_prefix', 'username', 'domain',
            'installation_id', 'status', 'version', 'activation_limit', 'activation_count',
            'activated_at', 'installed_at', 'last_verified_at', 'token_expires_at',
            'revoked_at', 'revoked_reason', 'expires_at', 'notes',
        ];

        foreach ($expected as $column) {
            $this->assertTrue(Schema::hasColumn('licenses', $column), "licenses is missing: {$column}");
        }
    }

    public function test_purchase_codes_never_stores_a_plaintext_code(): void
    {
        $columns = Schema::getColumnListing('purchase_codes');

        // A column literally called `code` would be the obvious way to
        // accidentally store the secret. Assert it does not exist.
        $this->assertNotContains('code', $columns);
        $this->assertContains('code_hash', $columns);
        $this->assertContains('code_last4', $columns);
    }

    public function test_licenses_never_stores_a_plaintext_key(): void
    {
        $columns = Schema::getColumnListing('licenses');

        $this->assertNotContains('license_key', $columns);
        $this->assertNotContains('purchase_code', $columns);
        $this->assertContains('license_key_hash', $columns);
        $this->assertContains('purchase_code_hash', $columns);
    }

    /**
     * The uniqueness that stops one licence key existing twice. Enforced in the
     * database, not only in application code, so a race between two requests
     * cannot produce a duplicate.
     */
    public function test_license_key_hash_is_unique(): void
    {
        $codeId = $this->insertPurchaseCode();

        $this->insertLicense($codeId, ['license_id' => 'lic_a', 'license_key_hash' => str_repeat('a', 64)]);

        $this->expectException(\Illuminate\Database\QueryException::class);

        $this->insertLicense($codeId, ['license_id' => 'lic_b', 'license_key_hash' => str_repeat('a', 64)]);
    }

    public function test_installation_id_is_unique_across_licenses(): void
    {
        $codeId = $this->insertPurchaseCode();

        $this->insertLicense($codeId, [
            'license_id'       => 'lic_c',
            'license_key_hash' => str_repeat('c', 64),
            'installation_id'  => 'inst_shared',
        ]);

        $this->expectException(\Illuminate\Database\QueryException::class);

        // The same installation claiming a second licence is exactly the
        // "copied the whole VPS" case, and the database refuses it.
        $this->insertLicense($codeId, [
            'license_id'       => 'lic_d',
            'license_key_hash' => str_repeat('d', 64),
            'installation_id'  => 'inst_shared',
        ]);
    }

    public function test_license_id_is_unique(): void
    {
        $codeId = $this->insertPurchaseCode();

        $this->insertLicense($codeId, ['license_id' => 'lic_same', 'license_key_hash' => str_repeat('e', 64)]);

        $this->expectException(\Illuminate\Database\QueryException::class);

        $this->insertLicense($codeId, ['license_id' => 'lic_same', 'license_key_hash' => str_repeat('f', 64)]);
    }

    public function test_purchase_code_hash_is_unique(): void
    {
        $this->insertPurchaseCode(['code_hash' => str_repeat('9', 64)]);

        $this->expectException(\Illuminate\Database\QueryException::class);

        $this->insertPurchaseCode(['code_hash' => str_repeat('9', 64)]);
    }

    /**
     * A failed activation attempt has no licence to attach to, and that is
     * precisely the event most worth recording. The column must be nullable.
     */
    public function test_audit_log_accepts_an_entry_with_no_license(): void
    {
        DB::table('license_audit_logs')->insert([
            'license_id'  => null,
            'actor_type'  => 'customer',
            'action'      => 'activation.rejected',
            'description' => 'Unrecognised purchase code.',
            'severity'    => 'warning',
            'created_at'  => now(),
        ]);

        $this->assertSame(1, DB::table('license_audit_logs')->count());
    }

    public function test_releases_are_unique_per_version_and_channel(): void
    {
        $row = [
            'version'         => '1.0.0',
            'channel'         => 'stable',
            'object_key'      => 'releases/stable/teezer-1.0.0.tar.gz',
            'checksum_sha256' => str_repeat('b', 64),
            'created_at'      => now(),
            'updated_at'      => now(),
        ];

        DB::table('license_releases')->insert($row);

        // The same version on a DIFFERENT channel is legitimate.
        DB::table('license_releases')->insert(array_merge($row, ['channel' => 'beta']));
        $this->assertSame(2, DB::table('license_releases')->count());

        $this->expectException(\Illuminate\Database\QueryException::class);
        DB::table('license_releases')->insert($row);
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    private function insertPurchaseCode(array $overrides = []): int
    {
        return DB::table('purchase_codes')->insertGetId(array_merge([
            'code_hash'        => str_repeat('1', 64),
            'code_last4'       => '1234',
            'status'           => 'available',
            'activation_limit' => 1,
            'created_at'       => now(),
            'updated_at'       => now(),
        ], $overrides));
    }

    private function insertLicense(int $purchaseCodeId, array $overrides = []): void
    {
        DB::table('licenses')->insert(array_merge([
            'purchase_code_id'    => $purchaseCodeId,
            'purchase_code_hash'  => str_repeat('1', 64),
            'purchase_code_last4' => '1234',
            'license_key_prefix'  => 'RL-AB',
            'username'            => 'customer01',
            'domain'              => 'customer.com',
            'status'              => 'active',
            'activation_limit'    => 1,
            'activation_count'    => 0,
            'created_at'          => now(),
            'updated_at'          => now(),
        ], $overrides));
    }
}
