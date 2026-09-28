#!/usr/bin/env bash
# ── TEEZER: disabled. Reelsoo-only legacy script kept for reference; see ../reelsoo-legacy/README.md ──
echo "Refusing to run: $0 is a Reelsoo-only legacy script (not for Teezer)." >&2; exit 1
# Reelsoo Moderation Module - Full Deployment Script
# Deploys to VPS: <REELSOO_HOST>
# Run from Windows Git Bash or WSL:
#   bash deploy/deploy-moderation.sh
set -euo pipefail

VPS_HOST="${VPS_HOST:-<REELSOO_HOST>}"
VPS_USER="${VPS_USER:-root}"

# Never hardcode the credential. It used to live here in plain text, in a file tracked
# by git and pushed to GitHub - which meant anyone with read access to the repo had root
# on production. Supply it at run time instead:
#
#   VPS_PASS='…' bash deploy/deploy-moderation.sh
#
# Better still, use an SSH key and drop sshpass entirely.
VPS_PASS="${VPS_PASS:-}"
if [[ -z "$VPS_PASS" ]]; then
    echo "ERROR: VPS_PASS is not set." >&2
    echo "Run:  VPS_PASS='your-password' bash deploy/deploy-moderation.sh" >&2
    exit 1
fi
DEPLOY_DIR="/var/www/reelsoo"
APP_DIR="$DEPLOY_DIR/server"
SCANNER_DIR="$DEPLOY_DIR/scanner"
FRONTEND_DIR="$DEPLOY_DIR/frontend"

echo "=================================================="
echo "  Reelsoo Moderation Module Deployment"
echo "  Target: $VPS_USER@$VPS_HOST"
echo "=================================================="

# Helper: run command on VPS
ssh_cmd() {
    sshpass -p "$VPS_PASS" ssh -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" "$@"
}

# Helper: copy file/dir to VPS
scp_to() {
    sshpass -p "$VPS_PASS" scp -r -o StrictHostKeyChecking=no "$1" "$VPS_USER@$VPS_HOST:$2"
}

# Check sshpass is available
if ! command -v sshpass &>/dev/null; then
    echo "Installing sshpass..."
    apt-get install -y sshpass 2>/dev/null || brew install sshpass 2>/dev/null || \
        { echo "ERROR: Please install sshpass: apt install sshpass"; exit 1; }
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

echo ""
echo "--> Step 1: Copy scanner files to VPS..."
ssh_cmd "mkdir -p /tmp/reelsoo_deploy/scanner"
scp_to "$REPO_ROOT/scanner/." "/tmp/reelsoo_deploy/scanner/"

echo ""
echo "--> Step 2: Run scanner setup on VPS..."
scp_to "$SCRIPT_DIR/setup-scanner.sh" "/tmp/setup-scanner.sh"
ssh_cmd "chmod +x /tmp/setup-scanner.sh && bash /tmp/setup-scanner.sh"

echo ""
echo "--> Step 3: Deploy Laravel backend..."
ssh_cmd "cd $APP_DIR && git pull origin main"
ssh_cmd "cd $APP_DIR && composer install --no-dev --optimize-autoloader --no-interaction"
ssh_cmd "cd $APP_DIR && php artisan migrate --force"
ssh_cmd "cd $APP_DIR && php artisan config:cache"
ssh_cmd "cd $APP_DIR && php artisan route:cache"
ssh_cmd "cd $APP_DIR && php artisan view:cache"

echo ""
echo "--> Step 4: Add MODERATION env vars to Laravel .env..."
ssh_cmd "grep -q 'MODERATION_ENABLED' $APP_DIR/.env || cat >> $APP_DIR/.env << 'EOF'

# === Media Moderation ===
MODERATION_ENABLED=true
SCANNER_URL=http://127.0.0.1:7891
SCANNER_API_KEY=
SCANNER_TIMEOUT=300
MODERATION_PRESIGN_TTL=60
EOF"

echo ""
echo "--> Step 5: Set up moderation queue worker..."
ssh_cmd "grep -q 'moderation' /etc/supervisor/conf.d/reelsoo.conf 2>/dev/null || \
cat >> /etc/supervisor/conf.d/reelsoo.conf << 'EOF'

[program:reelsoo-moderation-worker]
command=php $APP_DIR/artisan queue:work --queue=moderation,default --sleep=3 --tries=2 --timeout=660
directory=$APP_DIR
user=www-data
numprocs=2
redirect_stderr=true
stdout_logfile=/var/log/reelsoo-moderation-worker.log
autostart=true
autorestart=true
EOF
supervisorctl reread 2>/dev/null || true
supervisorctl update 2>/dev/null || true
supervisorctl restart reelsoo-moderation-worker:* 2>/dev/null || true"

echo ""
echo "--> Step 6: Build and deploy frontend..."
ssh_cmd "cd $FRONTEND_DIR && git pull origin main && npm ci && npm run build"
ssh_cmd "pm2 restart reelsoo-frontend 2>/dev/null || pm2 start npm --name reelsoo-frontend -- start --prefix $FRONTEND_DIR"

echo ""
echo "--> Step 7: Restart services..."
ssh_cmd "php $APP_DIR/artisan queue:restart"
ssh_cmd "systemctl restart reelsoo-scanner"
ssh_cmd "pm2 save"

echo ""
echo "--> Step 8: Verify scanner health..."
ssh_cmd "sleep 5 && curl -sf http://127.0.0.1:7891/health && echo '' || echo 'Scanner health check failed - check logs'"

echo ""
echo "=================================================="
echo "  Deployment complete!"
echo "  Admin moderation panel: https://reelsoo.com/admin/moderation"
echo "  Scanner health: ssh to VPS → curl http://127.0.0.1:7891/health"
echo "  Scanner logs: journalctl -u reelsoo-scanner -f"
echo "  Worker logs: tail -f /var/log/reelsoo-moderation-worker.log"
echo "=================================================="
