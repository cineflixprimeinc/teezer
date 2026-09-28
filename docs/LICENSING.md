# Reelsoo Marketplace Licensing

How a copy of Reelsoo is sold, activated, installed, verified and updated —
and, just as importantly, what it deliberately does **not** do.

---

## The one property everything else follows from

> A customer's installed Reelsoo never contacts reelsoo.com to serve traffic.

Not on a page load, a login, a signup, a feed request, an API call, a media
request or an admin action. Their site runs on their server, their database,
their storage, their domain.

This is achieved with an **asymmetric** licence, not a phone-home check:

```
LICENCE SERVER (reelsoo.com)          CUSTOMER VPS (customer.com)
┌────────────────────────┐            ┌────────────────────────────┐
│  RSA PRIVATE KEY       │            │  RSA PUBLIC KEY            │
│  never leaves this box │  ───────▶  │  ships in the package      │
│                        │  signed    │                            │
│  signs a licence ONCE  │  licence   │  verifies it LOCALLY,      │
│  at activation         │            │  offline, on every request │
└────────────────────────┘            └────────────────────────────┘
```

Signing needs the private key. Verifying needs only the public key. So the
customer can check their licence as often as they like without ever reaching
us, and cannot forge one without the key they do not have.

We are contacted exactly three times, ever:

| When | What | How often |
|---|---|---|
| Activation | Redeem a purchase code for a licence key | Once |
| Installation | Register the install, receive the signed token | Once |
| Heartbeat | Renew the token, learn about revocation | Once a day, scheduled |
| Update | Authorise a download | Only when the operator runs `reelsoo update` |

---

## End-to-end flow

```
  MARKETPLACE
      │  buyer receives a purchase code
      ▼
  reelsoo.com/activate-license
      │  purchase code + domain + username
      ▼
  LICENCE SERVER  ──▶  licence key (shown ONCE, stored only as a hash)
      │
      ▼
  CUSTOMER VPS
      │  curl -fsSL https://install.reelsoo.com/install.sh | bash
      │  installer asks for: purchase code, licence key, domain
      ▼
  POST /license/release   ──▶  licence validated, presigned B2 URL returned
      │                        (15 min, one object, no credentials)
      ▼
  download + checksum + signature verified
      │
      ▼
  install, configure, migrate, build
      │
      ▼
  POST /license/install   ──▶  signed licence token
      │
      ▼
  customer.com/setup      ──▶  branding, admin account, regional, SMTP
      │
      ▼
  RUNNING INDEPENDENTLY
      └─ every request: local RSA verify, no network
```

---

## The signed token

```json
{
  "product": "reelsoo",
  "license_id": "lic_9f3a1c77b2e40d5a8c11",
  "domain": "customer.com",
  "username": "customer01",
  "installation_id": "inst_01j8xw3k7m2q9prbn4vz6hdyta",
  "status": "active",
  "licensed_version": "1.0.0",
  "issued_at": "2026-09-08T12:00:00+00:00",
  "expires_at": "2026-12-07T12:00:00+00:00",
  "license_expires_at": null
}
```

Wire format: `RLS1.<base64url(payload)>.<base64url(RSA-SHA256 signature)>`

**What is not in it:** no purchase code, no licence key, no hash of either, no
email address, no internal row id. A leaked token identifies an installation and
authorises nothing.

**`expires_at` vs `license_expires_at`** — the first is the re-verification
window (90 days, renewed by every heartbeat). The second is the commercial term,
and is `null` for a normal perpetual marketplace licence.

Verification checks the signature over the **exact bytes received**, never a
re-encoded copy of the parsed payload. `json_encode` is not canonical, so a
re-encode round trip would reject legitimate tokens — and the usual fix for that
is to loosen the check, which is how signature verification gets quietly
disabled.

---

## Domain binding

`App\Licensing\Support\DomainNormalizer` is the single definition of what a
licensed domain is, used on **both** sides so binding and verification cannot
disagree.

Equivalent (all match a licence for `customer.com`):

```
customer.com   www.customer.com   CUSTOMER.COM
https://customer.com/   http://customer.com:8080/path?q=1   customer.com.
```

Rejected — and there is a test for each:

```
customer.com.evil.com     suffix attack
evil-customer.com         prefix attack
evilcustomer.com          concatenation
app.customer.com          subdomains do not inherit
customer.co               TLD swap
203.0.113.10              a bare IP is not a domain
```

Comparison is `hash_equals` on the normalised forms. There is no suffix, prefix
or wildcard matching anywhere in the file, because that is exactly where this
check normally breaks.

The comparison is against **`APP_URL`**, never the request `Host` header — a
header is attacker-controlled, so binding to it would let any visitor satisfy
the licence by sending the licensed hostname.

---

## Failure behaviour

| State | Meaning | Effect |
|---|---|---|
| `disabled` | Enforcement off — this is reelsoo.com | Serves normally |
| `valid` | Everything checks out | Serves normally |
| `grace` | Past `expires_at`, within 30 days | **Serves normally** + warning header |
| `stale` | Past grace | **Serves** (`warn`, default) or 503 (`block`) |
| `missing` | Never activated | 403 with a link to `/setup` |
| `invalid` | Bad signature / wrong product | 403 |
| `mismatch` | Wrong domain or wrong installation | 403 |
| `suspended` / `revoked` / `expired` | A real licence decision | 403 |

Two deliberate choices:

**Our downtime is never their outage.** `grace` and `stale` both keep serving. A
stale token means *we* could not be reached; punishing a paying customer for
that is wrong, so the default `stale_policy` is `warn`.

**Nothing is ever destroyed.** No licence state deletes data, drops a database,
disables accounts or redirects anyone to reelsoo.com. The worst case is a 403
with an explanation, and it reverses the moment the licence is valid again.

---

## Secrets: what is stored where

| Secret | Where it lives | Recoverable? |
|---|---|---|
| RSA private key | `/etc/reelsoo/license-signing-key.pem`, mode 0600, **outside the repo** | Backed up offline only |
| RSA public key | `server/resources/licensing/public.pem`, ships to customers | Yes, it is not secret |
| Purchase code | SHA-256 hash + last 4 characters | **No** — reissue instead |
| Licence key | SHA-256 hash + 5-char prefix | **No** — reissue instead |
| Signed token | Customer's `storage/app/license/license.json`, mode 0600 | Reissued by heartbeat |
| Licence key (customer copy) | Customer's `.env` as `LICENSE_KEY` | Theirs |

SHA-256 rather than bcrypt is correct here: these are 120+ bit CSPRNG secrets,
not human-chosen passwords, so there is no dictionary to attack and no offline
guessing advantage to remove. What a slow hash *would* cost is a KDF on every
verification and the ability to do a single indexed lookup by hash.

Nothing logs a plaintext code, key, token or signature.
`LicenseAuditLog::record()` additionally scrubs any field whose name looks like
a secret before writing, so a careless caller cannot leak one by accident.

---

## Package boundary

`App\Licensing\Server\*` — the code that mints licences — is **excluded from the
marketplace package** (`.marketplace-exclude`). So is the admin licence
controller, the licence models and migrations, the activation page, and the
installer itself.

The package is built with `git archive`, which exports **only tracked files**.
A real `.env`, `node_modules`, `storage/app` contents, a stray database dump or
an accidentally-copied signing key are untracked or gitignored, so none of them
can be swept in. A recursive copy would take every one of them, and that is the
single most likely way a production secret escapes.

Two independent secret scans run before anything is published:

```bash
scripts/build-marketplace-release.sh 1.0.0   # builds, then scans; deletes the
                                             # package if the scan fails
cd server && php artisan license:release-publish <package> 1.0.0 --publish
                                             # scans the archive again
```

---

## Operator commands

**Licensor (reelsoo.com):**

```bash
php artisan license:keygen                 # ONCE, by hand. Never in a deploy script.
php artisan license:release-publish <file> <version> --publish
```

`license:keygen` refuses to overwrite an existing key without `--force` and a
confirmation, because regenerating it invalidates **every licence ever issued**.

Purchase codes are generated from the admin panel:
`reelsoo.com/admin/licenses` → Purchase codes → Generate.

**Customer:**

```bash
reelsoo status     # licence and service status (local, no network)
reelsoo update     # authorise, download, back up, apply, health check
reelsoo verify     # heartbeat now
reelsoo rollback   # restore the previous version + database
```

`reelsoo update` takes a **file and database backup before touching anything**,
and aborts the whole update if either backup fails.

---

## Configuration

Both halves default to **off**.

```env
LICENSE_SERVER_ENABLED=false      # true ONLY on reelsoo.com
LICENSING_CLIENT_ENABLED=false    # true ONLY in a customer package
```

`LICENSING_CLIENT_ENABLED=false` is why production reelsoo.com can never be
blocked by its own licence check: `EnsureLicensed` returns on its first line and
the `/license/*` routes are not even registered.

Full reference: `server/config/licensing.php`.

---

## Tests

```bash
cd server

# Crypto core: signing, verification, every tamper case, domain binding
vendor/bin/phpunit tests/Unit/Licensing/LicenseCryptoTest.php

# Migrations: schema, constraints, rollback
php -d extension=pdo_sqlite vendor/bin/phpunit tests/Feature/Licensing/LicenseMigrationsTest.php
```

Two environment notes for a Windows workstation:

- RSA key **generation** needs an `openssl.cnf`; some Windows PHP builds ship
  without one. Signing and verifying do not. The crypto tests skip rather than
  fail in that case. Set `OPENSSL_CONF` to a real config file to run them.
- `pdo_sqlite` is not enabled in the local `php.ini`, hence the
  `-d extension=pdo_sqlite` above.

A green run of the migration test is **not** a substitute for running `migrate`
against a staging PostgreSQL before production — SQLite exercises structure and
constraints, not PostgreSQL-specific behaviour.
