# Reelsoo-only legacy ops files - DO NOT USE FOR TEEZER

Everything in this directory was written for Reelsoo's own production estate
(MySQL primary/replica failover, the original single-VPS MySQL bootstrap, the
password-based moderation deploy, the stale MySQL/R2 server env example).
It is kept only as historical reference.

- Nothing here applies to Teezer (PostgreSQL 17, Backblaze B2, VPS1 77.237.242.249 /
  VPS2 77.237.243.122). Use `DEPLOYMENT.md` at the repo root instead.
- Every shell script here exits immediately with an error; the guard line after the
  shebang is intentional. Do not remove it.
- Reelsoo host IPs have been replaced with `<REELSOO_HOST>` / `<REELSOO_HOST_2>`
  placeholders. Never put real Reelsoo addresses back: this repository must not be
  able to reach Reelsoo infrastructure.
- Do not install the `systemd/` units on any Teezer machine.

| File | What it was |
|---|---|
| `scripts/promote-vps2.sh`, `scripts/vps1-watchdog.sh`, `scripts/vps1-boot-guard.sh`, `scripts/install-failover.sh` | MySQL replica auto-failover |
| `systemd/reelsoo-boot-guard.service`, `systemd/reelsoo-watchdog.service` | units for the above |
| `setup-vps.sh` | first-generation MySQL single-VPS bootstrap |
| `deploy-moderation.sh` | password/sshpass deploy of the scanner to Reelsoo's VPS |
| `env/server.env.example` | stale MySQL/R2-era server `.env` template (use `server/.env.example`) |
