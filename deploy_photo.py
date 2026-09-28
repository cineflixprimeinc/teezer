import paramiko, sys, time, os

# ─── Teezer two-VPS deploy ────────────────────────────────────────────────────
# VPS1 = app  (nginx + Next.js web/admin + APISIX + Laravel API + Go API +
#        PostgreSQL 17/PgBouncer + Redis + Centrifugo + media origin)
# VPS2 = workers (Laravel queue workers / FFmpeg transcoding) + LiveKit.
#
# This script ONLY ever talks to the two Teezer hosts below. It refuses to run if
# a host is (or is overridden to) any source platform server address.
#
# Auth uses an SSH key (no passwords in this repo). Set it up once:
#   ssh-keygen -t ed25519 -f ~/.ssh/teezer_deploy -N ""
#   ssh-copy-id -i ~/.ssh/teezer_deploy.pub root@77.237.242.249
#   ssh-copy-id -i ~/.ssh/teezer_deploy.pub root@77.237.243.122
# Override the key path with the TEEZER_DEPLOY_KEY env var if needed.
#
# NOTE: this does NOT run database migrations. Run `php artisan migrate` by hand on
# VPS1 after reviewing pending migrations (see DEPLOYMENT.md).
PROJECT  = "/var/www/teezer"
BRANCH   = os.environ.get("TEEZER_DEPLOY_BRANCH", "main")
KEY_PATH = os.environ.get("TEEZER_DEPLOY_KEY", os.path.expanduser("~/.ssh/teezer_deploy"))

VPS1 = {"name": "VPS1 / app",     "host": os.environ.get("TEEZER_VPS1", "77.237.242.249")}
VPS2 = {"name": "VPS2 / workers", "host": os.environ.get("TEEZER_VPS2", "77.237.243.122")}

# Source platform servers. This repository must never connect to any of these.
FORBIDDEN_HOSTS = {
    "167.233.204.183", "75.119.156.93", "185.193.19.86",
    "217.217.251.44", "217.217.249.50", "139.99.89.181", "139.99.89.10",
}

# App box: refresh code, Laravel caches, rebuild web + admin, reload php-fpm, restart web.
APP_STEPS = [
    f"cd {PROJECT} && git fetch origin {BRANCH} && git reset --hard origin/{BRANCH} && git log --oneline -1",
    f"cd {PROJECT}/server && php artisan optimize:clear && php artisan optimize",
    f"cd {PROJECT}/frontend && npm run build 2>&1 | tail -20",
    f"cd {PROJECT}/admin && npm run build 2>&1 | tail -20",
    "systemctl reload php8.3-fpm 2>/dev/null || systemctl reload php8.2-fpm 2>/dev/null || systemctl reload php-fpm 2>/dev/null || echo 'php-fpm reload skipped'",
    "pm2 restart teezer-web teezer-admin --update-env && pm2 status",
]

# Worker box: refresh code, ensure runtime dirs, rebuild Laravel caches, restart workers.
WORKER_STEPS = [
    f"cd {PROJECT} && git fetch origin {BRANCH} && git reset --hard origin/{BRANCH} && git log --oneline -1",
    f"cd {PROJECT}/server && mkdir -p storage/logs storage/framework/cache/data storage/framework/sessions storage/framework/views storage/app/public bootstrap/cache && chmod -R 775 storage bootstrap/cache",
    f"cd {PROJECT}/server && php artisan optimize:clear && php artisan optimize",
    "pm2 restart /^teezer-/ --update-env && pm2 status",
]


def safe_print(text):
    sys.stdout.buffer.write(text.encode("utf-8", "replace"))
    sys.stdout.buffer.flush()


def run(ssh, cmd, timeout=600):
    safe_print(f"\n>>> {cmd}\n")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout, get_pty=True)
    while not stdout.channel.exit_status_ready():
        if stdout.channel.recv_ready():
            safe_print(stdout.channel.recv(4096).decode("utf-8", "replace"))
        time.sleep(0.1)
    for chunk in iter(lambda: stdout.channel.recv(4096), b""):
        safe_print(chunk.decode("utf-8", "replace"))
    rc = stdout.channel.recv_exit_status()
    safe_print(f"\n[exit {rc}]\n")
    return rc


def deploy(target, steps):
    if target["host"] in FORBIDDEN_HOSTS:
        sys.exit(f"[REFUSED] {target['host']} is a source platform server. This repo never deploys there.")
    print(f"\n========== Deploying {target['name']} ({target['host']}) ==========")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(
        target["host"], username="root", key_filename=KEY_PATH,
        look_for_keys=False, allow_agent=False, timeout=30,
    )
    print("Connected.\n")
    failed = False
    for cmd in steps:
        rc = run(ssh, cmd, timeout=600)
        if rc != 0:
            print(f"\n[WARN] Command exited {rc}")
            failed = True
            if "npm run build" in cmd:
                print("[ABORT] Build failed - not restarting.")
                break
    ssh.close()
    return failed


if __name__ == "__main__":
    for t in (VPS1, VPS2):
        if t["host"] in FORBIDDEN_HOSTS:
            sys.exit(f"[REFUSED] {t['name']} is set to {t['host']}, a source platform server address. Aborting.")
    if not os.path.exists(KEY_PATH):
        sys.exit(
            f"Deploy SSH key not found at {KEY_PATH}.\n"
            "Create it and copy it to both Teezer VPS:\n"
            "  ssh-keygen -t ed25519 -f ~/.ssh/teezer_deploy -N \"\"\n"
            "  ssh-copy-id -i ~/.ssh/teezer_deploy.pub root@77.237.242.249\n"
            "  ssh-copy-id -i ~/.ssh/teezer_deploy.pub root@77.237.243.122\n"
            "(or set TEEZER_DEPLOY_KEY to an existing key path)."
        )
    # Allow deploying only one side:  python deploy_photo.py app|workers
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    fail = False
    if which in ("all", "app"):
        fail |= deploy(VPS1, APP_STEPS)
    if which in ("all", "workers"):
        fail |= deploy(VPS2, WORKER_STEPS)
    print("\n=== Deploy finished (with warnings) ===" if fail else "\n=== Deploy complete (app + workers) ===")
