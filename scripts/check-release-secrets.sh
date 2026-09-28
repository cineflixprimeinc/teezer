#!/usr/bin/env bash
#
# Scan a built marketplace package for anything that must never ship.
#
# Run by build-marketplace-release.sh, and independently re-run by
# `php artisan license:release-publish` before an upload. Two independent
# checks of the same property, because the failure is irreversible: once a
# package with a production secret in it has been downloaded by one customer,
# that secret is public and must be rotated.
#
# Exit 0 = clean. Any non-zero exit means DO NOT PUBLISH.
#
set -euo pipefail

readonly TARGET="${1:-}"

if [[ -z "$TARGET" || ! -e "$TARGET" ]]; then
    echo "Usage: check-release-secrets.sh <package.tar.gz | directory>" >&2
    exit 2
fi

if [[ -t 1 ]]; then
    readonly RED=$'\033[31m' GREEN=$'\033[32m' BOLD=$'\033[1m' RESET=$'\033[0m'
else
    readonly RED='' GREEN='' BOLD='' RESET=''
fi


# Directories that are never part of the shipped source and are enormous.
# Without pruning these, the scan below walks a few hundred thousand files and
# takes minutes; with them it takes seconds. They are also the one place a
# false positive is guaranteed - third-party test fixtures are full of sample
# keys and tokens that are not ours and not secret.
readonly PRUNE=( -name node_modules -o -name vendor -o -name .git -o -name .next -o -name build )

# find with the standard prune idiom, applied to every scan in this script.
scan_find() {
    find "$ROOT" \( "${PRUNE[@]}" \) -prune -o "$@" -print 2>/dev/null
}

findings=0
report() { printf '  %s✗%s %s\n' "$RED" "$RESET" "$*"; findings=$((findings + 1)); }
pass()   { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$*"; }

# Work against a directory either way, so the content checks below can grep.
workdir=""

# The explicit `return 0` matters. Bash lets the EXIT trap's last command set
# the script's exit status, and when TARGET is a directory `$workdir` is empty,
# so the `[[ -n ... ]]` test fails and turns a CLEAN verdict into exit 1 - a
# scanner that reports "no secrets found" while telling the build to abort.
cleanup() {
    [[ -n "$workdir" && -d "$workdir" ]] && rm -rf "$workdir"
    return 0
}
trap cleanup EXIT

if [[ -f "$TARGET" ]]; then
    workdir=$(mktemp -d)
    tar -xzf "$TARGET" -C "$workdir"
    ROOT="$workdir"

    # The release archive wraps everything in a single teezer-<version>/
    # directory, so after extraction the tree is $workdir/teezer-1.0.0/server/...
    # and NOT $workdir/server/... . Descend into it.
    #
    # This is not cosmetic. Every `[[ -e "$ROOT/<path>" ]]` check below - which
    # includes the licensor-code check, the single most important test in this
    # script - silently found nothing and reported PASS, while the "expected
    # contents" section reported the client files MISSING from the same wrong
    # prefix. A scan that cannot see the files it is scanning for is worse than
    # no scan, because it prints a tick.
    shopt -s nullglob
    entries=("$workdir"/*)
    shopt -u nullglob
    if [[ ${#entries[@]} -eq 1 && -d "${entries[0]}" ]]; then
        ROOT="${entries[0]}"
    fi
else
    ROOT="$TARGET"
fi

printf '\n%sScanning %s%s\n\n' "$BOLD" "$TARGET" "$RESET"

# ── 1. Files that must not exist at all ──────────────────────────────────────
printf '%sForbidden files%s\n' "$BOLD" "$RESET"

declare -a FORBIDDEN_PATHS=(
    '.env'
    '.env.production'
    '.env.local'
    '.env.backup'
    'license-signing-key.pem'
    'private.pem'
    'id_rsa'
    'id_ed25519'
    '.git'
    'auth.json'
    'terraform.tfstate'
)

for name in "${FORBIDDEN_PATHS[@]}"; do
    if scan_find -name "$name" | head -1 | grep -q .; then
        report "found $name"
        scan_find -name "$name" | sed "s|^$ROOT/|      |" | head -5
    fi
done

# Any private key, whatever it is called.
#
# The size bound is in BYTES (`c`), not megabytes. `-size -1M` looks like it
# means "under a megabyte" and does not: find rounds each file's size UP to a
# whole 1M block, so a 100-byte key counts as 1M and `-1M` matches nothing at
# all. That silently disabled this entire check until a synthetic package with
# a planted key failed to trip it.
while IFS= read -r file; do
    if grep -qE 'BEGIN (RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY' "$file" 2>/dev/null; then
        report "private key material in ${file#"$ROOT"/}"
    fi
done < <(scan_find -type f -size -1000000c \( -name '*.pem' -o -name '*.key' -o -name '*.p12' -o -name '*.pfx' \))

# Database dumps and archives of data.
while IFS= read -r file; do
    report "database dump: ${file#"$ROOT"/}"
done < <(scan_find -type f \( -name '*.sql' -o -name '*.dump' -o -name '*.sqlite' -o -name '*.sqlite3' \) | grep -v 'database/schema/' || true)

[[ $findings -eq 0 ]] && pass "no forbidden files"

# ── 2. Licensor-side code that must not ship ─────────────────────────────────
printf '\n%sLicensor code%s\n' "$BOLD" "$RESET"

before=$findings

for path in \
    'server/app/Licensing/Server' \
    'server/app/Http/Controllers/Api/Admin/AdminLicenseController.php' \
    'server/app/Console/Commands/LicenseKeygen.php' \
    'server/app/Models/License.php' \
    'install/install.sh'
do
    [[ -e "$ROOT/$path" ]] && report "licensor-side path present: $path"
done

[[ $findings -eq $before ]] && pass "no licensor-side code"

# ── 3. Secret-shaped content ─────────────────────────────────────────────────
# Patterns for real credential formats, not the word "secret". A config key
# named MAIL_PASSWORD with an empty value is correct and expected; a config key
# with 40 characters after the = is not.
printf '\n%sCredential patterns%s\n' "$BOLD" "$RESET"

before=$findings

# Same pruning as scan_find, expressed the way grep wants it.
readonly GREP_EXCLUDES=(
    --exclude-dir=node_modules --exclude-dir=vendor --exclude-dir=.git
    --exclude-dir=.next --exclude-dir=build --exclude-dir=dist
)

# Every pattern is anchored with a leading boundary - start of line, or a
# character that cannot appear inside the token itself.
#
# Without it these match INSIDE base64 blobs, and this package contains SVGs
# with embedded base64 images. "AIza" followed by 35 base64 characters occurs
# by chance in that data: the first real run flagged three .svg assets on a
# fragment reading ...MIqAIzaMBmgrdpB2Zx..., which is image bytes, not a key.
# A real credential is always preceded by =, ", ', :, whitespace or a line
# start, so the boundary keeps every true positive and drops that whole class
# of noise.
declare -a PATTERNS=(
    '(^|[^0-9A-Za-z])AKIA[0-9A-Z]{16}:AWS access key id'
    '(^|[^0-9A-Za-z_])sk_live_[0-9a-zA-Z]{20,}:Stripe live secret key'
    '(^|[^0-9A-Za-z_])rk_live_[0-9a-zA-Z]{20,}:Stripe live restricted key'
    '(^|[^0-9A-Za-z_])ghp_[0-9a-zA-Z]{36}:GitHub personal access token'
    '(^|[^0-9A-Za-z_])xox[baprs]-[0-9a-zA-Z-]{10,}:Slack token'
    '(^|[^0-9A-Za-z_-])AIza[0-9A-Za-z_-]{35}:Google API key'
    '-----BEGIN [A-Z ]*PRIVATE KEY-----:private key block'
    '(^|[^0-9A-Za-z])005[0-9a-f]{9}[0-9a-zA-Z]{27}:Backblaze B2 application key'
)

for entry in "${PATTERNS[@]}"; do
    pattern="${entry%%:*}"
    label="${entry#*:}"

    if matches=$(grep -rlEI "${GREP_EXCLUDES[@]}" "$pattern" "$ROOT" 2>/dev/null | head -5); then
        if [[ -n "$matches" ]]; then
            report "$label"
            printf '%s\n' "$matches" | sed "s|^$ROOT/|      |"
        fi
    fi
done

# Non-empty values on keys that should always ship blank.
while IFS= read -r hit; do
    report "populated credential: ${hit#"$ROOT"/}"
done < <(grep -rhoEI "${GREP_EXCLUDES[@]}" \
    '^(DB_PASSWORD|DB_PGSQL_PASSWORD|MAIL_PASSWORD|REDIS_PASSWORD|B2_APPLICATION_KEY|APP_KEY|JWT_SECRET|LICENSE_KEY)=.{12,}' \
    "$ROOT" 2>/dev/null | head -10 || true)

[[ $findings -eq $before ]] && pass "no credential patterns"

# ── 4. Things that should be present ─────────────────────────────────────────
printf '\n%sExpected contents%s\n' "$BOLD" "$RESET"

for path in \
    'server/app/Licensing/Client/LicenseVerifier.php' \
    'server/app/Licensing/Support/DomainNormalizer.php' \
    'server/resources/licensing/public.pem' \
    'server/.env.example' \
    'bin/teezer'
do
    if [[ -e "$ROOT/$path" ]]; then
        pass "$path"
    else
        report "MISSING: $path — the package will not work without it"
    fi
done

# The public key must be a real key, not the placeholder committed to the repo.
if [[ -f "$ROOT/server/resources/licensing/public.pem" ]]; then
    if grep -q 'PLACEHOLDER' "$ROOT/server/resources/licensing/public.pem"; then
        report "public.pem is still the placeholder — run: php artisan license:keygen"
    elif ! grep -q 'BEGIN PUBLIC KEY' "$ROOT/server/resources/licensing/public.pem"; then
        report "public.pem does not look like a PEM public key"
    else
        pass "public.pem is a real verification key"
    fi
fi

# ── Verdict ──────────────────────────────────────────────────────────────────
printf '\n'

if [[ $findings -eq 0 ]]; then
    printf '%s%sCLEAN%s — no secrets found, expected contents present.\n\n' "$GREEN" "$BOLD" "$RESET"
    exit 0
fi

printf '%s%s%d problem(s) found. DO NOT PUBLISH THIS PACKAGE.%s\n\n' "$RED" "$BOLD" "$findings" "$RESET"
exit 1
