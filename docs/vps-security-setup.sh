#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Teezer VPS Security Hardening Script
# Run as root on Ubuntu/Debian: bash vps-security-setup.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

echo "==> [1/6] Installing security packages..."
apt-get update -q
apt-get install -y ufw fail2ban

# ─── UFW Firewall ────────────────────────────────────────────────────────────
echo "==> [2/6] Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   comment 'SSH'
ufw allow 80/tcp   comment 'HTTP (redirect to HTTPS)'
ufw allow 443/tcp  comment 'HTTPS'
ufw --force enable
ufw status verbose

# ─── Fail2ban ────────────────────────────────────────────────────────────────
echo "==> [3/6] Configuring Fail2ban..."
cat > /etc/fail2ban/jail.local <<'FAIL2BAN'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5
backend  = systemd

[sshd]
enabled  = true
port     = ssh
logpath  = %(sshd_log)s
maxretry = 3
bantime  = 86400

[nginx-http-auth]
enabled  = true
logpath  = /var/log/nginx/error.log

[nginx-limit-req]
enabled  = true
filter   = nginx-limit-req
logpath  = /var/log/nginx/error.log
maxretry = 10
bantime  = 3600

[nginx-badbots]
enabled  = true
filter   = nginx-badbots
logpath  = /var/log/nginx/access.log
maxretry = 1
bantime  = 86400
FAIL2BAN

systemctl enable fail2ban
systemctl restart fail2ban
echo "Fail2ban status:"
fail2ban-client status

# ─── Nginx rate-limit zones ───────────────────────────────────────────────────
echo "==> [4/6] Adding Nginx rate-limit config..."
cat > /etc/nginx/conf.d/rate-limiting.conf <<'NGINX_RATE'
# Memory zones for rate limiting (defined at http level)
limit_req_zone $binary_remote_addr zone=api_global:10m  rate=100r/m;
limit_req_zone $binary_remote_addr zone=auth_login:10m  rate=5r/m;
limit_req_zone $binary_remote_addr zone=auth_register:10m rate=3r/m;
limit_req_zone $binary_remote_addr zone=pwd_reset:10m   rate=3r/m;
limit_conn_zone $binary_remote_addr zone=conn_limit:10m;

# Log when rate limit kicks in
limit_req_status  429;
limit_conn_status 429;
NGINX_RATE

# ─── Nginx security headers + hardening ──────────────────────────────────────
echo "==> [5/6] Adding Nginx security headers..."
cat > /etc/nginx/conf.d/security-headers.conf <<'NGINX_SEC'
# Hide Nginx version
server_tokens off;

# Limit request body to 10 MB (prevents large payload DoS)
client_max_body_size 10M;

# Timeout settings (reduce slow-loris risk)
client_body_timeout   10s;
client_header_timeout 10s;
keepalive_timeout     30s;
send_timeout          10s;

# Security headers added to every response
add_header X-Content-Type-Options   "nosniff"                          always;
add_header X-Frame-Options          "DENY"                             always;
add_header X-XSS-Protection         "1; mode=block"                    always;
add_header Referrer-Policy          "strict-origin-when-cross-origin"  always;
add_header Permissions-Policy       "camera=(), microphone=(), geolocation=(), payment=()" always;

# Block common scanner paths
location ~* ^/(\.env|\.git|wp-admin|wp-login|phpmyadmin|adminer|phpinfo|xmlrpc|actuator) {
    return 404;
}

# Block empty user-agents on API
# (add to your API server block if needed)
NGINX_SEC

# ─── Apply rate limits to your site config ────────────────────────────────────
# Find the active site config and patch it
SITE_CONF=$(ls /etc/nginx/sites-enabled/ | head -1)
if [ -n "$SITE_CONF" ]; then
    SITE_PATH="/etc/nginx/sites-enabled/$SITE_CONF"
    echo "Found site config: $SITE_PATH"

    # Apply rate limits to auth endpoints if not already present
    if ! grep -q "limit_req zone=auth_login" "$SITE_PATH"; then
        echo ""
        echo "!! ACTION REQUIRED: Add these lines to the 'location /api/' block"
        echo "!! in $SITE_PATH :"
        echo ""
        echo "    limit_req zone=api_global burst=20 nodelay;"
        echo "    limit_conn conn_limit 20;"
        echo ""
        echo "    # For /api/auth/login:"
        echo "    # limit_req zone=auth_login burst=3 nodelay;"
        echo ""
        echo "    # For /api/auth/register:"
        echo "    # limit_req zone=auth_register burst=2 nodelay;"
    fi
fi

# Test config before reload
nginx -t && systemctl reload nginx
echo "Nginx reloaded successfully."

# ─── MySQL / Redis binding check ─────────────────────────────────────────────
echo "==> [6/6] Checking MySQL and Redis are bound to localhost only..."
MYSQL_BIND=$(grep -r "^bind-address" /etc/mysql/ 2>/dev/null | head -1 || true)
echo "MySQL bind-address: ${MYSQL_BIND:-'(not found - check /etc/mysql/mysql.conf.d/mysqld.cnf)'}"

REDIS_BIND=$(grep "^bind " /etc/redis/redis.conf 2>/dev/null | head -1 || true)
echo "Redis bind: ${REDIS_BIND:-'(not found - check /etc/redis/redis.conf)'}"

# Ensure Redis is not protected-mode off with a bind to 0.0.0.0
if echo "$REDIS_BIND" | grep -q "0\.0\.0\.0"; then
    echo "WARNING: Redis is bound to 0.0.0.0 - change to 127.0.0.1 in /etc/redis/redis.conf!"
fi

echo ""
echo "==> Security hardening complete!"
echo ""
echo "Summary:"
echo "  ✓ UFW: only 22/80/443 open"
echo "  ✓ Fail2ban: SSH + Nginx jails active"
echo "  ✓ Nginx: rate-limit zones, security headers, server_tokens off"
echo ""
echo "Cloudflare Dashboard TODO (do manually):"
echo "  1. Security → Bot Fight Mode → ON"
echo "  2. Security → Security Level → High"
echo "  3. Security → WAF → Managed Rules → Cloudflare Managed Ruleset → Deploy"
echo "  4. Security → DDoS → HTTP DDoS Attack Protection → High"
echo "  5. SSL/TLS → Mode → Full (Strict)"
echo "  6. SSL/TLS → Edge Certificates → Always Use HTTPS → ON"
echo "  7. Speed → Optimization → HTTP/2 → ON"
echo "  8. Workers → deploy cloudflare-security-worker.js → route: *.teezer.live/*"
