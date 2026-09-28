#!/usr/bin/env bash
# Teezer Scanner Setup Script
# Run as root on Ubuntu 22.04
# Usage: bash setup-scanner.sh
set -euo pipefail

SCANNER_DIR="/var/www/teezer/scanner"
VENV_DIR="$SCANNER_DIR/venv"
SERVICE_FILE="/etc/systemd/system/teezer-scanner.service"

echo "==> Installing system dependencies..."
apt-get update -qq
apt-get install -y python3.11 python3.11-venv python3.11-dev python3-pip \
    ffmpeg libgl1 libglib2.0-0 libsm6 libxext6 libxrender-dev \
    build-essential git curl wget

echo "==> Creating scanner directory..."
mkdir -p "$SCANNER_DIR"

echo "==> Copying scanner files..."
cp -r /tmp/teezer_deploy/scanner/. "$SCANNER_DIR/"

echo "==> Creating Python virtual environment..."
python3.11 -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"

echo "==> Upgrading pip..."
pip install --upgrade pip wheel setuptools

echo "==> Installing Python dependencies (this may take a few minutes)..."
pip install fastapi uvicorn[standard] pydantic python-dotenv requests Pillow numpy

echo "==> Installing NudeNet (downloads ONNX model on first use)..."
pip install nudenet

echo "==> Attempting to install OpenNSFW2 (optional, needs TensorFlow)..."
pip install opennsfw2 || echo "WARNING: OpenNSFW2 install failed - NudeNet-only mode will be used."

deactivate

echo "==> Setting up .env file..."
if [ ! -f "$SCANNER_DIR/.env" ]; then
    cat > "$SCANNER_DIR/.env" <<'ENVEOF'
SCANNER_HOST=127.0.0.1
SCANNER_PORT=7891
NUDITY_REJECT_THRESHOLD=0.85
NUDITY_PENDING_THRESHOLD=0.65
NSFW_REJECT_THRESHOLD=0.85
NSFW_PENDING_THRESHOLD=0.65
VIDEO_FRAME_INTERVAL=2
VIDEO_SCAN_DURATION=120
VIDEO_FULL_SCAN_FRAME_INTERVAL=1
LOG_LEVEL=INFO
ENVEOF
    echo "Created default .env - edit $SCANNER_DIR/.env to customize."
fi

echo "==> Setting file permissions..."
chown -R www-data:www-data "$SCANNER_DIR"
chmod -R 750 "$SCANNER_DIR"
chmod 600 "$SCANNER_DIR/.env"

echo "==> Installing systemd service..."
cat > "$SERVICE_FILE" <<'SVCEOF'
[Unit]
Description=Teezer Media Safety Scanner
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/teezer/scanner
EnvironmentFile=/var/www/teezer/scanner/.env
ExecStart=/var/www/teezer/scanner/venv/bin/uvicorn app:app --host 127.0.0.1 --port 7891 --workers 1 --log-level info --no-access-log
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=teezer-scanner
LimitNOFILE=65536
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable teezer-scanner
systemctl restart teezer-scanner

echo "==> Waiting for scanner to start..."
sleep 8

if systemctl is-active --quiet teezer-scanner; then
    echo "==> Scanner is running!"
    # Pre-warm the NudeNet model download
    curl -sf http://127.0.0.1:7891/health || echo "Warning: Health check failed - models may still be downloading"
else
    echo "ERROR: Scanner failed to start. Check logs:"
    journalctl -u teezer-scanner --no-pager -n 30
    exit 1
fi

echo ""
echo "===================================================="
echo "  Teezer Scanner setup complete!"
echo "  Health: http://127.0.0.1:7891/health"
echo "  Logs:   journalctl -u teezer-scanner -f"
echo "===================================================="
