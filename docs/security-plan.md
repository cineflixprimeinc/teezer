# Reelsoo - Security Plan

> **Domain:** reelsoo.com | **API:** api.reelsoo.com | **VPS:** 217.217.249.50

---

## Security Principles

1. **Secrets never in code or Git** - `.env`, DB passwords, API keys, Firebase credentials are always excluded
2. **Defence in depth** - multiple layers: server hardening, application logic, database constraints
3. **Least privilege** - DB user has only the grants it needs; admin role is the only role with admin routes
4. **Fail secure** - unknown state → deny, not permit
5. **Audit trail** - admin moderation actions always log `reviewed_by` (admin's user ID)

---

## 1. Secrets Management

### Never Committed to Git

The root `.gitignore` excludes:
```
server/.env
server/vendor/
server/storage/app/
mobile-app/build/
*.apk
*.aab
```

### `.env` Rules

- `.env.example` is committed with placeholder values (no real secrets)
- `.env` on VPS is created manually: `cp .env.example .env && nano .env`
- The `.env` file is owned by `www-data`, chmod `640`
- `APP_DEBUG=false` in production - never expose stack traces
- `APP_KEY` is generated fresh per environment: `php artisan key:generate`

### Sensitive Variables

| Variable | Location | Visibility |
|----------|----------|-----------|
| `DB_PASSWORD` | VPS `.env` only | Never committed |
| `APP_KEY` | VPS `.env` only | Never committed |
| `ADMIN_PASSWORD` | VPS `.env` only | Never committed, changed after first seed |
| `MAIL_PASSWORD` | VPS `.env` only | Never committed |
| Firebase credentials JSON | VPS file system, path in `.env` | Never committed |
| R2/S3 keys (Phase 6) | VPS `.env` only | Never committed |

---

## 2. Authentication Security

### Web (Session / Dashboard)

| Threat | Mitigation |
|--------|-----------|
| Session fixation | `$request->session()->regenerate()` after successful login |
| CSRF | Laravel's default `VerifyCsrfToken` middleware on all POST/PUT/DELETE |
| Brute force | Rate limit `POST /login`: 10 requests/min per IP |
| Banned user access | `RoleMiddleware` checks `is_banned` on every authenticated request; logs user out if banned |
| Role escalation | `RoleMiddleware` enforces role on every request - not just at login time |
| Admin URL enumeration | No separate `/admin-login` URL; all roles use the same `/login` |
| Session hijacking | `SESSION_SECURE_COOKIE=true` (HTTPS only), `SESSION_HTTP_ONLY=true` |

### API (Sanctum Token / Flutter)

| Threat | Mitigation |
|--------|-----------|
| Token theft | Tokens stored in device `SharedPreferences` (not localStorage on web) |
| Token accumulation | On login, all existing `flutter-app` tokens are revoked before issuing new one |
| Expired token reuse | Token expiry set in `config/sanctum.php` (Phase 9 tuning) |
| Unauthenticated access | `auth:sanctum` middleware on all protected API routes |
| Banned user | Login endpoint checks `is_banned` before issuing token; returns 403 |

### Password Security

- Passwords hashed with Laravel's `Hash::make()` (bcrypt, cost factor 12)
- Password field on `User` model has `hashed` cast - plain text passed to `create()` is auto-hashed
- Password reset uses signed, time-limited tokens via Laravel's built-in reset system
- Minimum password length: 8 characters

---

## 3. Authorization (Role-Based Access Control)

### Single Login Architecture

```
/login          ← all roles enter here
     │
     ▼
Auth::attempt() → checks users.role + users.is_banned
     │
     ▼
redirect → /dashboard (smart redirect to role-appropriate URL)
```

### Route-Level Enforcement

```php
Route::middleware(['auth', 'role:admin'])       // Admin only
Route::middleware(['auth', 'role:creator,admin']) // Creator or Admin
Route::middleware(['auth', 'role:user,creator,admin']) // Any authenticated
```

### `RoleMiddleware` Logic

1. If not authenticated → redirect to `/login`
2. If `is_banned` → logout, invalidate session, redirect to `/login` with error
3. If role not in allowed list → `abort(403)` - renders `errors/403.blade.php`

---

## 4. Input Validation & Injection Prevention

### SQL Injection

- All DB queries use Laravel Eloquent or the Query Builder with **parameter binding**
- Raw queries are forbidden unless using `DB::select('...', [$param])` with bindings
- Never concatenate user input into SQL strings

### XSS

- Blade's `{{ }}` syntax **auto-escapes** HTML entities
- Use `{!! !!}` only for pre-sanitized HTML (never raw user input)
- File uploads: filenames are replaced with UUIDs server-side - original name never stored or displayed

### Mass Assignment

- All models use `$fillable` arrays (explicit whitelist)
- `$guarded = []` is never used

### Validation

- All API inputs use `$request->validate()` or dedicated `FormRequest` classes
- File uploads are validated by MIME type (not just extension) using `mimes:mp4,mov,webm` rules
- Numeric IDs in routes use `int $id` type hints; Eloquent `findOrFail()` returns 404 automatically

---

## 5. File Upload Security

| Control | Implementation |
|---------|---------------|
| Filename sanitization | All uploaded files renamed to `Str::uuid() . '.' . $ext` - original filename discarded |
| MIME type validation | Server-side: `$request->validate(['video' => 'mimes:mp4,mov,webm'])` |
| Max file size | Nginx: `client_max_body_size 500M`; Laravel: `max:512000` (KB) in validation |
| Storage location | **Cloudflare R2** - no user files written to VPS disk |
| Public access | Via `media.reelsoo.com` custom domain only - no public bucket listing policy |
| Verification documents | Stored in R2; served via presigned/temporary URLs only - never publicly listable |
| Virus scanning | Phase 9: integrate ClamAV scan before storing |

### Cloudflare R2 Security

- **R2 credentials are never sent to any client.** `CLOUDFLARE_R2_ACCESS_KEY_ID` and `CLOUDFLARE_R2_SECRET_ACCESS_KEY` live in VPS `.env` only.
- All uploads are proxied through the Laravel API - no direct client-to-R2 uploads.
- Laravel validates file type (MIME), file size, authentication, and ownership before any write to R2.
- The `StorageService` is the single code path for all R2 operations; nothing writes to R2 directly.
- `document_key` is stored in MySQL so documents can be deleted from R2 when a verification request is removed.
- Future: presigned upload URLs for large video files (reduces VPS bandwidth) - still validated by Laravel before the presigned URL is issued.

---

## 6. API Security

| Control | Implementation |
|---------|---------------|
| Rate limiting | Per-endpoint groups (see `backend-plan.md`) |
| CORS | `config/cors.php` - restrict `allowed_origins` in production |
| Token bearer prefix | Sanctum validates `Authorization: Bearer {token}` header |
| JSON-only responses | `Accept: application/json` header triggers JSON error responses |
| HTTP method enforcement | Routes explicitly define allowed methods - wrong method → 405 |
| Response envelope | All errors follow standard envelope: no raw PHP stack traces exposed |
| Version header | Flutter app sends `X-App-Version`; API can gate deprecated behavior |

### CORS Configuration (`config/cors.php`)

```php
'allowed_origins' => ['*'],           // ← Flutter needs this (mobile app)
'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
'allowed_headers' => ['Authorization', 'Content-Type', 'Accept', 'X-App-Version'],
'exposed_headers' => [],
'max_age' => 0,
'supports_credentials' => false,
```

> For the web dashboard, Sanctum stateful domains restrict cookie-based sessions.  
> For the Flutter API, `*` origin is acceptable (Bearer token auth, not cookie).

---

## 7. Server Security

### SSH Hardening

```bash
# /etc/ssh/sshd_config
PasswordAuthentication no
PermitRootLogin no
AllowUsers deploy
```

Only SSH key auth. Password login disabled. Root login disabled.

### Firewall (UFW)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'   # ports 80 + 443
sudo ufw enable
```

MySQL (3306) is NOT exposed externally. Only `127.0.0.1` binding.

### fail2ban

Active on SSH (default config) and Nginx auth log (Phase 9 custom filter for login endpoint).

```bash
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### Nginx Security Headers

Applied in both server blocks:

```nginx
add_header X-Frame-Options "SAMEORIGIN";
add_header X-Content-Type-Options "nosniff";
add_header X-XSS-Protection "1; mode=block";
add_header Referrer-Policy "strict-origin-when-cross-origin";
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

Block dot files:
```nginx
location ~ /\.(?!well-known).* { deny all; }
```

---

## 8. Database Security

| Control | Implementation |
|---------|---------------|
| Dedicated DB user | `reelsoo_user@localhost` - no root, no remote access |
| Scoped privileges | `GRANT ALL ON reelsoo.*` - only this database |
| No external access | MySQL bound to `127.0.0.1` |
| Strong root password | Set during `mysql_secure_installation` |
| Anonymous users removed | Done via `mysql_secure_installation` |
| Soft deletes | `videos` table uses `deleted_at` - no permanent data destruction on first remove |
| Admin audit trail | `reviewed_by` column records which admin performed moderation actions |

---

## 9. SSL / HTTPS

- Let's Encrypt certificates via Certbot for `reelsoo.com`, `www.reelsoo.com`, `api.reelsoo.com`
- HTTP → HTTPS redirect configured by Certbot automatically
- HSTS header with 1-year max-age
- Auto-renewal via `certbot.timer` systemd service
- `SESSION_SECURE_COOKIE=true` - session cookie only sent over HTTPS

---

## 10. Backup Security

Daily MySQL backup via cron:
```cron
0 2 * * * mysqldump -u reelsoo_user -p'${DB_PASSWORD}' reelsoo | gzip > /var/backups/reelsoo_$(date +%Y%m%d).sql.gz
0 3 * * * find /var/backups -name "reelsoo_*.sql.gz" -mtime +14 -delete
```

- Backup files stored on VPS only (not committed to Git)
- Access restricted: `chmod 600 /var/backups/reelsoo_*.sql.gz`
- Phase 9: Offsite backup to Cloudflare R2 or S3

---

## 11. Security Checklist (Pre-Launch)

### Server
- [ ] Non-root deploy user created
- [ ] SSH key-only auth enabled, passwords disabled
- [ ] Root login disabled
- [ ] UFW firewall configured and active
- [ ] fail2ban active
- [ ] MySQL external access blocked

### Application
- [ ] `APP_DEBUG=false`
- [ ] `APP_ENV=production`
- [ ] `.env` not in Git
- [ ] `APP_KEY` generated fresh
- [ ] `ADMIN_PASSWORD` changed after first seed
- [ ] All routes with auth use middleware
- [ ] Rate limiting active on login and upload routes
- [ ] File uploads use UUID filenames

### SSL/HTTPS
- [ ] HTTPS active on `reelsoo.com`, `www.reelsoo.com`, `api.reelsoo.com`
- [ ] HTTP redirects to HTTPS
- [ ] HSTS header active
- [ ] Auto-renewal timer running

### Database
- [ ] `mysql_secure_installation` completed
- [ ] Dedicated `reelsoo_user` with scoped grants only
- [ ] Daily backup cron active

### Monitoring
- [ ] Laravel log level set to `error` in production
- [ ] Nginx error log checked post-deploy
- [ ] Queue worker running via Supervisor
