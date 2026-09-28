# LiveKit - self-hosted media engine behind StreamHub

> **Teezer:** VPS1 = 77.237.242.249 (Laravel), VPS2 = 77.237.243.122 (LiveKit).
> Public signaling is `wss://livekit.teezer.live` (Cloudflare record **DNS-only**,
> grey cloud - WebRTC UDP/TCP media cannot go through the Cloudflare proxy).
> Webhook target: `https://api.teezer.live/api/v1/streamhub/webhook`.
> The dated "verified live" notes below describe the original deployment this
> repo was forked from; re-verify each step on Teezer's own boxes.

StreamHub (`server/app/StreamHub/`) is Teezer's own orchestration layer -
room lifecycle, token minting, moderation enforcement, recording. LiveKit is
the media engine underneath it: the actual SFU that carries audio/video and
does ICE/adaptive bitrate. Nothing outside `App\StreamHub\*` should ever
reference the LiveKit SDK directly - Space controllers only ever call
`StreamHubService`.

```
                                                                       [ VPS2 ]
React Native app  ->  wss://livekit.teezer.live (nginx) -> livekit-server (SFU, 127.0.0.1:7880)
                                                                              -> livekit-egress (needs Chrome)
    [ VPS1 ]                                                     ^
Laravel API (StreamHubService)                                   |
   -> SSH tunnel (127.0.0.1:7880) --------- only port 22 is open between the two VPSes -----'
                             ^
                             |
                   /api/v1/streamhub/webhook  <-  livekit-server webhooks
                   (App\StreamHub\LiveKitWebhookController, over the public internet - VPS2 -> VPS1's api.teezer.live)
```

This is **Phase 1**: single-node, Spaces (audio) only, **no TURN** (see §3 -
not a regression, the previous Cloudflare setup had none either). Cloudflare's
Realtime SFU (`App\Services\Realtime\CloudflareRealtimeService`) stays
configured and untouched as the rollback path - reverting is a
controller-wiring revert, not a re-deploy. Clustering (multiple
`livekit-server` nodes behind a shared Redis, load balancing, node failover)
is an explicit later phase, not this one - the `redis` block in
`livekit.yaml.example` exists ONLY because `livekit-egress` needs it to
receive job dispatches, even from exactly one `livekit-server` node.

Deployed on **VPS2** (77.237.243.122), alongside the existing
moderation/queue/transcoding workers - a deliberate resource-sharing
tradeoff. Watch CPU/bandwidth once real rooms move over (see §4); no
Prometheus/Grafana exists in this repo yet, so that's a manual
`systemctl status` / log-watching job for now, same as every other service
here.

**Verified live end-to-end (2026-07-29):** `lk room join` (LiveKit's own real
client SDK via its CLI, not a raw HTTP probe) from VPS1 - a genuinely
external box - to `wss://livekit.teezer.live` reached "connected to room".
Internal Twirp room-service calls (what Laravel actually uses) verified
separately via loopback. Both work.

Files here:

| File | Purpose |
|---|---|
| `livekit.yaml.example` | livekit-server config template - copy, fill in the generated key/secret, keep the real copy out of git. |
| `livekit-server.service` | systemd unit for the bare-binary SFU install. |
| `redis-livekit.conf` / `redis-livekit.service` | Dedicated Redis instance for LiveKit+Egress coordination only. |
| `nginx-livekit.conf` | Reverse-proxies public WSS signaling to livekit-server - see §3 for why this exists. |
| `docker-compose.egress.yml` | Runs livekit-egress via Docker (needs headless Chrome - see its own header comment for why this is the one piece that isn't a bare binary). |
| `.env.livekit.example` | The two secrets `docker-compose.egress.yml` needs. |
| `teezer-livekit-tunnel.service` | Installed on **VPS1**, not VPS2 - the SSH tunnel Laravel needs to reach livekit-server's Twirp API across the VPS1/VPS2 boundary. See §5. |

---

## 1. Deploy livekit-server

```bash
# 1. Binary
curl -sSL https://get.livekit.io | bash          # -> /usr/local/bin/livekit-server
livekit-server generate-keys                     # -> API key + secret, save both

# 2. System user + config
useradd --system --no-create-home --shell /usr/sbin/nologin livekit
mkdir -p /etc/livekit && chown livekit:livekit /etc/livekit
cp livekit.yaml.example /etc/livekit/livekit.yaml
# edit /etc/livekit/livekit.yaml: fill in `keys` and `webhook.api_key` with
# the generated pair, confirm the redis address
chmod 600 /etc/livekit/livekit.yaml && chown livekit:livekit /etc/livekit/livekit.yaml

# 3. systemd
cp livekit-server.service /etc/systemd/system/livekit-server.service
```

Full install/enable steps are in `livekit-server.service`'s own header
comment - follow it verbatim rather than re-deriving the sequence.

## 2. Deploy the dedicated Redis instance

**Before** starting `livekit-server` (it depends on this - see the unit's
`Wants=`/`After=`). Full steps in `redis-livekit.service`'s header comment.
Verify: `redis-cli -p 6400 ping` -> `PONG`.

## 3. Networking - nginx in front, TURN off (both learned the hard way)

**The original plan was different and didn't survive contact with a real
deployment - read this before changing anything here.** LiveKit has a
"single-port" mode meant for very restrictive networks: its built-in TURN
relay on 443/TLS can multiplex TURN-over-TLS AND WSS signaling on the same
port, so a client can reach everything through one port carriers rarely
block. That was the original design for this file (`turn.enabled: true`,
`tls_port: 443`, LiveKit terminating its own TLS, no nginx in front). **It
was live-tested and did not work**: with a real TLS listener and a valid
cert, the TLS handshake itself would complete over loopback but the
WS-signaling layer on top of it never finished a request - confirmed with
LiveKit's own `lk` CLI (a real client, not a generic HTTP probe), both from
the same box and from VPS1 externally. `turn.external_tls` (whether LiveKit
expects to terminate TLS itself vs. expects it already stripped by an
upstream proxy) was the first fix and got the handshake further, but
WS-signaling on that port still never completed. Whatever the remaining gap
is - a version-specific bug, an undocumented additional flag - it wasn't
found in the time spent on it, and there's no working reference deployment
of this exact mode to diff against.

**What actually ships, and is verified working:** the standard, boring,
well-proven pattern instead. `nginx-livekit.conf` terminates TLS on 443 and
reverse-proxies the WebSocket upgrade straight to livekit-server's plain
internal port (`7880`) - exactly like every other proxied service in this
repo. TURN is **off** (`turn.enabled: false` in `livekit.yaml.example`) -
this is genuinely not a regression, since the Cloudflare SFU setup it
replaces also had no TURN. Revisit as a fast-follow, most likely by running
TURN on its own standard port (5349) instead of trying to share 443 with
signaling - do not re-attempt the single-port multiplexed mode without a
working reference to compare against.

```bash
cp nginx-livekit.conf /etc/nginx/sites-available/livekit.conf
ln -s /etc/nginx/sites-available/livekit.conf /etc/nginx/sites-enabled/livekit.conf
nginx -t && systemctl enable --now nginx   # or reload, if already running for something else
```

**Cert:** `certbot certonly --standalone -d livekit.teezer.live` (port 80
free at the time this was deployed; if something else claims 80 later, this
needs `--webroot` against nginx's own docroot instead). nginx reads
`/etc/letsencrypt/live/livekit.teezer.live/{fullchain,privkey}.pem` directly
- it runs its master process as root, so no permission workaround is needed
the way it would be for a non-root service reading that directory (see
`nginx-livekit.conf`'s `ssl_certificate*` directives). certbot's systemd
timer renews automatically; nginx needs a `reload` after renewal - a
standard certbot deploy-hook (`systemctl reload nginx`) covers that if this
box doesn't already have one for its other certs.

**Firewall (as of this writing, VPS2):** no `ufw` - the box uses raw
`nftables` with `INPUT` policy `ACCEPT` by default and only narrow
IP-scoped `DROP` rules for specific ports (ClickHouse's 8123/9000, restricted
to VPS1's IP - see `project_clickhouse_analytics`). This means 443 and the
RTC UDP range are reachable with **no rule needed** - verify with
`nft list ruleset` before assuming otherwise, since this could change.
`livekit-server`'s plain HTTP port (`7880`, Twirp room-service calls from
Laravel) and Redis (`6400`) stay loopback-only by BINDING to 127.0.0.1 (see
their configs) - that is what keeps them private on a box with no
default-deny firewall, not a port rule.

## 4. Deploy livekit-egress

```bash
cp .env.livekit.example .env
# fill in the SAME key/secret pair as livekit.yaml's `keys` block
chmod 600 .env
docker compose -f docker-compose.egress.yml up -d
docker compose -f docker-compose.egress.yml logs -f egress   # confirm it connects to Redis + livekit-server
```

Egress only activates when `StreamHubService::startRecording()` is called
(host enables recording on a Space) - it costs nothing idle otherwise beyond
the container itself sitting ready.

**Verified (2026-07-29):** deployed via `docker compose`, connected to Redis
and reported `service ready`. A `room-composite` egress request against a
real room reached `EGRESS_STARTING`, established its own WebRTC connection
into the room (ICE/DTLS fully connected, confirmed in the container logs),
and only aborted with "Start signal not received" because the test
participant never published an actual track for it to render - a test
artifact, not a pipeline bug. The full path (real published audio -> finished
file -> B2 upload -> `spaces.recording_url`) still needs verifying once a
real client can publish through a Space (§6 item 5).

**Capacity note:** unlike the previous Cloudflare SFU setup (zero VPS
bandwidth - media went app <-> Cloudflare edge), self-hosting means the SFU's
media fan-out now transits VPS2's NIC, and Egress's Chrome compositor adds
CPU load while a recording is active. This was an accepted tradeoff of
sharing VPS2 rather than provisioning a dedicated box - watch it once real
rooms move over.

## 5. Wire Laravel - and the SSH tunnel this needs (VPS1 -> VPS2)

**Laravel runs on VPS1; livekit-server runs on VPS2.** The first attempt at
this pointed `LIVEKIT_HOST` straight at VPS2's public IP - it failed with a
plain connection timeout, and `tcpdump` on VPS2 confirmed the packets never
even arrive: only port 22 is open between the two VPSes (the provider
firewalls everything else, same constraint already documented for
Postgres/Redis/ClickHouse cross-VPS access - see `project_clickhouse_analytics`).
So this needs the same fix: an SSH tunnel. `teezer-livekit-tunnel.service`
(in this directory, installed on **VPS1**) forwards VPS1's own
`127.0.0.1:7880` to VPS2's `127.0.0.1:7880` over SSH using a dedicated
`/root/.ssh/teezer_tunnel` key whose `authorized_keys` entry on VPS2 is
restricted with `permitopen="127.0.0.1:7880"`. See the unit file's own header
comment for the exact key setup.

```bash
# On VPS1:
cp teezer-livekit-tunnel.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now teezer-livekit-tunnel
curl http://127.0.0.1:7880   # should now reach livekit-server on VPS2
```

Then `server/.env`'s "StreamHub / LiveKit" block (see `server/.env.example`):
```dotenv
LIVEKIT_HOST=http://127.0.0.1:7880
LIVEKIT_API_KEY=<same pair as livekit.yaml>
LIVEKIT_API_SECRET=<same pair as livekit.yaml>
LIVEKIT_RECORDING_DISK=b2
LIVEKIT_RECORDING_BUCKET=
LIVEKIT_RECORDING_PREFIX=recordings/spaces
```
`LIVEKIT_HOST` stays `127.0.0.1:7880` even though the actual server is on a
different box - that's the tunnel's local end, not loopback-to-itself. The
public client-facing surface (`wss://livekit.teezer.live`) is unrelated and
never touched by Laravel's own Twirp calls. Recording credentials are read
from whatever disk `LIVEKIT_RECORDING_DISK` names
(`filesystems.disks.{disk}`) - not duplicated here, see `services.php`'s
livekit block comment.

Then whatever reloads php-fpm/opcache for `server/` (see `project_deployment`
notes: `systemctl restart php8.2-fpm`, never `reload` - opcache.validate_timestamps
is off).

## 6. Verify end-to-end

1. On VPS2: `systemctl status livekit-server redis-livekit nginx` - all `active (running)`, no restart-looping. On VPS1: `systemctl status teezer-livekit-tunnel` - same, plus `curl http://127.0.0.1:7880` actually returns something (not a timeout).
2. From an EXTERNAL box (not VPS2 itself - loopback tests can pass while the public path is still broken, as happened during this deployment): `lk room join --url wss://livekit.teezer.live --api-key ... --api-secret ... --identity test some-room` - look for `"connected to room"` in the log, not just the absence of an error.
3. From the app: join a Space, confirm `POST /spaces/{id}/rtc/token` returns a token, confirm two devices actually hear each other.
4. Force-mute as a moderator/admin - confirm the remote track actually stops (not just a UI badge - this is the real behavior change from the Cloudflare-SFU version, see `SpaceModerationController`'s doc comment).
5. Enable recording, end the Space, confirm the final file lands in the configured bucket under `LIVEKIT_RECORDING_PREFIX/{space_id}/` and `spaces.recording_url` resolves to a signed, playable URL via `SpaceController`/`SpaceReminderController`.
6. Kill a client's connection without hitting `/leave` (e.g. force-quit the app) - confirm the `participant_left` webhook reaps the seat and `speakers_count`/`listeners_count` correct themselves (`App\StreamHub\LiveKitWebhookController::onParticipantLeft`) rather than leaving `Space::hasOpenSpeakerSlot()` wrongly blocked.
