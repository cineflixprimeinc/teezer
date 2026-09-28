#!/usr/bin/env bash
#
# Build the marketplace release package FROM THE EXISTING SOURCE.
#
# This script does not rebuild, rewrite, refactor or regenerate anything. It
# exports the repository as it is, removes what must not ship, adds the few
# files an installation needs, and produces one .tar.gz. The application a
# customer receives is byte-for-byte the application in this repository, minus
# the exclusions.
#
# Why `git archive` and not `cp -r`:
#   `git archive` exports ONLY tracked files. A real .env, node_modules,
#   storage/app contents, a stray database dump, an accidentally-copied signing
#   key — none of them are tracked, so none of them can be picked up by
#   accident. A recursive copy would sweep every one of them in, and that is
#   the single most likely way a production secret escapes.
#
#   Usage:  scripts/build-marketplace-release.sh 1.0.0
#
set -euo pipefail

readonly VERSION="${1:-}"
readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly OUT_DIR="${TEEZER_BUILD_DIR:-$REPO_ROOT/build}"
readonly EXCLUDE_FILE="$REPO_ROOT/.marketplace-exclude"

if [[ -t 1 ]]; then
    readonly BOLD=$'\033[1m' DIM=$'\033[2m' RED=$'\033[31m' GREEN=$'\033[32m' YELLOW=$'\033[33m' RESET=$'\033[0m'
else
    readonly BOLD='' DIM='' RED='' GREEN='' YELLOW='' RESET=''
fi

step() { printf '\n%s%s%s\n' "$BOLD" "$1" "$RESET"; }
ok()   { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$*"; }
die()  { printf '\n  %sError:%s %s\n\n' "$RED" "$RESET" "$*" >&2; exit 1; }

[[ -n "$VERSION" ]] || die "Usage: $0 <version>   e.g. $0 1.0.0"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?$ ]] || die "Version must look like 1.0.0 or 1.0.0-beta.1"
[[ -f "$EXCLUDE_FILE" ]] || die "Missing $EXCLUDE_FILE"

cd "$REPO_ROOT"

# ── Preflight ────────────────────────────────────────────────────────────────
step "Preflight"

git rev-parse --git-dir >/dev/null 2>&1 || die "Not a git repository."

if [[ -n "$(git status --porcelain)" ]]; then
    warn "The working tree has uncommitted changes."
    warn "git archive exports COMMITTED content only, so those changes will NOT be in the package."
    read -rp "  Continue? [y/N] " reply
    [[ "$reply" =~ ^[Yy]$ ]] || die "Aborted."
fi

COMMIT=$(git rev-parse --short HEAD)
ok "Commit $COMMIT on $(git rev-parse --abbrev-ref HEAD)"

if [[ -f "$REPO_ROOT/server/resources/licensing/public.pem" ]] \
   && grep -q PLACEHOLDER "$REPO_ROOT/server/resources/licensing/public.pem"; then
    die "server/resources/licensing/public.pem is still the placeholder.
       Generate the real keypair first:  cd server && php artisan license:keygen
       Without a real public key, no installation can verify its licence."
fi

STAGING="$(mktemp -d)"
cleanup() { rm -rf "$STAGING"; }
trap cleanup EXIT

# ── Export ───────────────────────────────────────────────────────────────────
step "Exporting tracked files"

git archive --format=tar HEAD | tar -x -C "$STAGING"

exported=$(find "$STAGING" -type f | wc -l)
ok "$exported files exported from git"

# ── Remove exclusions ────────────────────────────────────────────────────────
step "Removing licensor-side and internal files"

removed=0
while IFS= read -r line; do
    line="${line%%#*}"
    line="$(printf '%s' "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    [[ -z "$line" ]] && continue

    # A trailing slash means a directory; otherwise it may be a glob.
    if [[ "$line" == */ ]]; then
        if [[ -d "$STAGING/${line%/}" ]]; then
            count=$(find "$STAGING/${line%/}" -type f | wc -l)
            rm -rf "${STAGING:?}/${line%/}"
            removed=$((removed + count))
            printf '  %s- %s (%s files)%s\n' "$DIM" "$line" "$count" "$RESET"
        fi
    else
        # shellcheck disable=SC2086
        for match in $STAGING/$line; do
            if [[ -e "$match" ]]; then
                if [[ -d "$match" ]]; then
                    count=$(find "$match" -type f | wc -l)
                    rm -rf "$match"
                    removed=$((removed + count))
                else
                    rm -f "$match"
                    removed=$((removed + 1))
                fi
                printf '  %s- %s%s\n' "$DIM" "${match#"$STAGING"/}" "$RESET"
            fi
        done
    fi
done < "$EXCLUDE_FILE"

ok "$removed files removed"

# ── Belt and braces ──────────────────────────────────────────────────────────
# git archive already guarantees these are absent (they are untracked or
# ignored). Deleting them again costs nothing and means a future change to
# .gitignore cannot silently start shipping them.
step "Second pass on never-ship paths"

find "$STAGING" -name '.env' -type f -delete 2>/dev/null || true
find "$STAGING" -name '.env.*' -type f ! -name '.env.example' -delete 2>/dev/null || true
find "$STAGING" -name '*.pem' -type f ! -name 'public.pem' -delete 2>/dev/null || true
find "$STAGING" -name '*.sql' -type f -not -path '*/database/schema/*' -delete 2>/dev/null || true
find "$STAGING" -name '*.log' -type f -delete 2>/dev/null || true
rm -rf "$STAGING/.git" "$STAGING/server/storage/app/license" 2>/dev/null || true

ok "done"

# ── Add what an installation needs ───────────────────────────────────────────
step "Adding installation files"

printf '%s\n' "$VERSION" > "$STAGING/VERSION"
ok "VERSION"

mkdir -p "$STAGING/bin"
if [[ -f "$REPO_ROOT/bin/teezer" ]]; then
    cp "$REPO_ROOT/bin/teezer" "$STAGING/bin/teezer"
    chmod +x "$STAGING/bin/teezer"
    ok "bin/teezer"
fi

# Laravel needs these directories to exist; git does not track empty ones.
for dir in \
    server/storage/app/public \
    server/storage/framework/cache/data \
    server/storage/framework/sessions \
    server/storage/framework/views \
    server/storage/logs \
    server/bootstrap/cache
do
    mkdir -p "$STAGING/$dir"
    touch "$STAGING/$dir/.gitkeep"
done
ok "storage and cache directories"

cat > "$STAGING/INSTALL.md" <<INSTALLDOC
# Teezer $VERSION

## Install

\`\`\`bash
curl -fsSL https://install.teezer.live/install.sh | bash
\`\`\`

The installer asks for your purchase code, your licence key
(from https://teezer.live/activate-license) and your domain, then handles
everything else: PHP, PostgreSQL, Redis, nginx, the application and the
services.

When it finishes, open \`https://your-domain.com/setup\` to create your
administrator account and configure the site.

## Requirements

- Ubuntu 22.04 / 24.04 or Debian 11 / 12
- 2 GB RAM minimum (4 GB recommended — the frontend build is the peak)
- 8 GB free disk
- A domain pointed at the server

## Managing your installation

\`\`\`bash
teezer status     # licence and service status
teezer update     # check for and apply updates
teezer verify     # re-verify your licence now
teezer rollback   # restore the previous version
\`\`\`

## About your licence

Your installation verifies its licence **locally**, using a signed token stored
on your own server. It does not contact teezer.live to serve pages, sign users
in, or run your API — your site keeps working normally even if our servers are
unreachable.

We are contacted only when you activate, when the daily verification runs, and
when you explicitly run an update.

Your licence is bound to the domain you activated it for. If you need to move
to a different domain or a different server, contact support@teezer.live and we
will reset the activation.

## Support

support@teezer.live
INSTALLDOC
ok "INSTALL.md"

# ── Package ──────────────────────────────────────────────────────────────────
step "Building the archive"

mkdir -p "$OUT_DIR"
PACKAGE="$OUT_DIR/teezer-$VERSION.tar.gz"

# --sort=name and a fixed mtime make the build reproducible: the same commit
# produces the same checksum, which is what makes the checksum meaningful.
tar --sort=name \
    --mtime="@$(git log -1 --format=%ct HEAD)" \
    --owner=0 --group=0 --numeric-owner \
    -czf "$PACKAGE" \
    -C "$(dirname "$STAGING")" \
    --transform "s|^$(basename "$STAGING")|teezer-$VERSION|" \
    "$(basename "$STAGING")"

CHECKSUM=$(sha256sum "$PACKAGE" | awk '{print $1}')
SIZE=$(du -h "$PACKAGE" | cut -f1)

ok "$PACKAGE ($SIZE)"

# ── Verify ───────────────────────────────────────────────────────────────────
step "Scanning for secrets"

if ! "$REPO_ROOT/scripts/check-release-secrets.sh" "$PACKAGE"; then
    rm -f "$PACKAGE"
    die "The secret scan failed. The package has been DELETED rather than left where it could be published by mistake."
fi

# ── Done ─────────────────────────────────────────────────────────────────────
printf '\n%s%sPackage ready%s\n\n' "$GREEN" "$BOLD" "$RESET"
printf '  File      %s\n' "$PACKAGE"
printf '  Version   %s\n' "$VERSION"
printf '  Commit    %s\n' "$COMMIT"
printf '  Size      %s\n' "$SIZE"
printf '  SHA-256   %s\n' "$CHECKSUM"
printf '\n  Publish it with:\n'
printf '    cd server && php artisan license:release-publish %s %s --publish\n\n' "$PACKAGE" "$VERSION"
