<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

/**
 * Generates the RSA keypair that underpins the whole licensing scheme.
 *
 * Run ONCE, on the licence server, by a human. Never in a deploy script, never
 * in CI, never automatically - regenerating the key invalidates every licence
 * ever issued, because every customer installation verifies against the old
 * public key. The command refuses to overwrite an existing key for exactly
 * that reason.
 *
 * The private key is written outside the repository (default
 * /etc/teezer/license-signing-key.pem) with mode 0600. The public key is
 * written into the repo at resources/licensing/public.pem, because that one is
 * MEANT to ship: it can verify a signature and cannot create one.
 *
 * LICENSOR-SIDE ONLY - excluded from the marketplace package.
 */
class LicenseKeygen extends Command
{
    protected $signature = 'license:keygen
                            {--bits=4096 : RSA key size}
                            {--force : Overwrite an existing private key (DESTROYS every issued licence)}';

    protected $description = 'Generate the RSA keypair used to sign Teezer licences (run once, by hand)';

    public function handle(): int
    {
        $privatePath = (string) config('licensing.server.private_key_path');
        $publicPath  = (string) config('licensing.client.public_key_path');
        $bits        = (int) $this->option('bits');

        if ($bits < 2048) {
            $this->error('Refusing to generate a key smaller than 2048 bits.');

            return self::FAILURE;
        }

        if (is_file($privatePath) && ! $this->option('force')) {
            $this->error('A signing key already exists at ' . $privatePath);
            $this->line('');
            $this->warn('Regenerating it would invalidate EVERY licence ever issued: each customer');
            $this->warn('installation verifies against the matching public key, and a new keypair');
            $this->warn('makes all of those signatures fail. Pass --force only if you genuinely');
            $this->warn('intend to re-issue every licence.');

            return self::FAILURE;
        }

        if ($this->option('force') && is_file($privatePath)) {
            if (! $this->confirm('This invalidates every issued licence. Are you certain?', false)) {
                $this->info('Aborted. Nothing was changed.');

                return self::SUCCESS;
            }
        }

        $this->info('Generating a ' . $bits . '-bit RSA keypair...');

        $resource = openssl_pkey_new([
            'private_key_bits' => $bits,
            'private_key_type' => OPENSSL_KEYTYPE_RSA,
        ]);

        if ($resource === false) {
            $this->error('OpenSSL could not generate a key.');

            // Drain the OpenSSL error queue. Without this the failure is a bare
            // "false" and the actual cause is invisible - which is exactly what
            // happened during development on a machine with no openssl.cnf: the
            // queue said "configuration file routines::no such file" and the
            // fix was one environment variable.
            $errors = [];

            while ($message = openssl_error_string()) {
                $errors[] = $message;
            }

            foreach (array_unique($errors) as $message) {
                $this->line('  ' . $message);
            }

            $this->line('');
            $this->warn('If the errors above mention a configuration file, OpenSSL cannot find');
            $this->warn('openssl.cnf. Point it at one and re-run, e.g.:');
            $this->line('  OPENSSL_CONF=/etc/ssl/openssl.cnf php artisan license:keygen');

            return self::FAILURE;
        }

        $privatePem = '';
        $passphrase = (string) config('licensing.server.private_key_passphrase');

        $exported = $passphrase !== ''
            ? openssl_pkey_export($resource, $privatePem, $passphrase)
            : openssl_pkey_export($resource, $privatePem);

        if (! $exported) {
            $this->error('Could not export the private key.');

            return self::FAILURE;
        }

        $details = openssl_pkey_get_details($resource);

        if ($details === false || empty($details['key'])) {
            $this->error('Could not derive the public key.');

            return self::FAILURE;
        }

        $directory = dirname($privatePath);

        if (! is_dir($directory) && ! @mkdir($directory, 0700, true) && ! is_dir($directory)) {
            $this->error('Could not create ' . $directory . '. Create it yourself and re-run, e.g.:');
            $this->line('  sudo mkdir -p ' . $directory . ' && sudo chown $USER ' . $directory);

            return self::FAILURE;
        }

        // Write with restrictive permissions BEFORE the content lands, so the
        // key is never briefly readable at a predictable path.
        $handle = @fopen($privatePath, 'w');

        if ($handle === false) {
            $this->error('Could not write ' . $privatePath);

            return self::FAILURE;
        }

        @chmod($privatePath, 0600);
        fwrite($handle, $privatePem);
        fclose($handle);
        @chmod($privatePath, 0600);

        // Best-effort scrub of the private key from process memory.
        $privatePem = str_repeat("\0", 64);
        unset($privatePem, $resource);

        if (! is_dir(dirname($publicPath))) {
            @mkdir(dirname($publicPath), 0755, true);
        }

        file_put_contents($publicPath, $details['key']);

        $this->line('');
        $this->info('Keypair generated.');
        $this->line('');
        $this->line('  Private key  ' . $privatePath . '  (mode 0600)');
        $this->line('  Public key   ' . $publicPath);
        $this->line('');
        $this->warn('The private key must NEVER be committed, packaged, copied to a customer');
        $this->warn('VPS, pasted into a chat, or backed up anywhere readable. If it leaks,');
        $this->warn('anyone can mint licences for your product.');
        $this->line('');
        $this->line('Back it up somewhere offline and encrypted. Losing it means you can no');
        $this->line('longer issue or renew licences for any existing customer.');
        $this->line('');
        $this->info('The PUBLIC key is safe to ship and is what goes into the customer package.');

        return self::SUCCESS;
    }
}
