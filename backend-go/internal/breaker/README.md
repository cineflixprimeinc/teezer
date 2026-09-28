# Circuit breakers

Two outbound dependencies in this service have a circuit breaker. Nothing else
does, deliberately.

## What is protected, and why

| Dependency | Why it needs one | Failure classification |
|---|---|---|
| **Wikimedia** (`internal/wikipedia`) | `Summary()` fans out to up to 3 requests, each retrying twice, at an 8s client timeout. During an outage that is up to **9 attempts and ~24s of wall clock** per request — for a decorative knowledge card. | Everything **except** `ErrNotFound`. A 404 is Wikimedia answering correctly. |
| **Cloudflare Turnstile** (`internal/turnstile`) | No retry, so no amplification — but every login pays the **8s client timeout** while Cloudflare is unreachable. | Transport failures and undecodable responses only. A failed challenge is the check *working*. |

## What is deliberately NOT protected

- **ClickHouse** — writes go through a buffered background writer with batching
  (`internal/clickhouse`). Already off the request path; a breaker would add a
  second failure layer and make recovery worse.
- **Centrifugo bridge** — local (`127.0.0.1`), 2s timeout, failures already
  swallowed. Nothing to gain.
- **Redis, Postgres, NATS** — connection pooling, timeouts and health handling
  already live in their clients.
- **api.video, PayPal, FCM/APNs, B2/R2 storage** — these are Laravel's, not this
  service's. A Go breaker cannot protect a PHP call.

## Failure classification is the important part

Only a genuine dependency failure may open a circuit. Counting expected business
answers would switch a healthy dependency off during normal use — a run of
searches for things that are not encyclopedia articles would open the Wikimedia
circuit and stop knowledge cards working entirely.

Each breaker gets an `IsFailure` predicate. Errors it rejects are returned to
the caller unchanged and counted as a **success** for the circuit. `New` panics
on a nil predicate, because the alternative is discovering the mistake in
production weeks later.

## States and configuration

`CLOSED` → `OPEN` after `ConsecutiveFailures` in a row. `OPEN` → `HALF-OPEN`
after `RecoveryTimeout`. `HALF-OPEN` admits `HalfOpenProbes` requests; all must
succeed to close, and the first failure re-opens and restarts the timeout.
`CountWindow` clears the failure run in `CLOSED`, so failures hours apart never
accumulate into a trip.

Recovery is automatic. No restart, no manual intervention.

| Env var | Default | Meaning |
|---|---|---|
| `BREAKER_WIKIPEDIA_FAILURES` / `BREAKER_TURNSTILE_FAILURES` | `5` | Consecutive failures to open |
| `..._RECOVERY_SECONDS` | `30` | OPEN → HALF-OPEN |
| `..._HALF_OPEN_PROBES` | `1` | Probes allowed while HALF-OPEN |
| `..._WINDOW_SECONDS` | `60` | Failure-run reset in CLOSED |

Defaults suit an optional dependency whose failure degrades a feature rather
than breaking the product. Unset variables fall back to
`breaker.DefaultTuning()` — never to zero, which would mean "trip on the first
failure and never recover".

## Retry interaction

The circuit wraps `Summary()` **as a whole**, not the individual GETs, so it
sits *above* the retry loop and caps it. Once open, the retries do not run at
all — that is the point. No retry logic was added; the existing narrow policy
(429/5xx retried with backoff, 404 never) is untouched.

## What users see

Nothing new. Both integrations were chosen so an open circuit produces the
**same answer the existing failure path already produces**, only instantly:

- **Wikipedia** → `breaker.ErrOpen` is a non-`ErrNotFound` error, so
  `knowledge.Service` declines to write a negative cache entry (an outage must
  not poison the cache for 7 days) and the handler degrades to
  `{"success": true, "data": {"found": false}}` — an empty card, HTTP 200.
- **Turnstile** → `{OK: false, ConfigError: true}`, which `AuthHandler` already
  treats as "allow through". Identical behaviour, without the 8s wait. Failing
  closed here would lock real users out during a Cloudflare incident.

No internal names, states, or infrastructure details reach a client.

## Observability

State transitions log one line each (`breaker: wikipedia closed -> open`).
Nothing is logged per request — a dependency being down must not also fill the
disk.

`GET /health` reports a `circuits` array with fixed dependency names and
counters (`success`, `failure`, `rejected`, `opened`, `half_open`). It is
**informational and never affects `status`**: an open circuit on an optional
dependency must not pull this API out of the load balancer, which would be
exactly the cascading failure the breakers exist to prevent. The only label is
the breaker's own fixed name — no user, IP, request or URL values.

There is no Prometheus in this service; if one is added, `Stats()` is the hook.

## Per-process state, on purpose

"This dependency is not answering" is a local judgement. It needs no
coordination, and every instance reaches it within seconds of its own first
failures. Shared state would put a Redis round trip on the very path whose
latency the breaker exists to protect, and let one network blip open circuits
everywhere at once.

This is why `gobreaker` **v1.0.0** is pinned rather than `v2`: v2 pulls in
`go-redsync` and `go-multierror` for its distributed Redis-backed mode — state
this design does not want. v1 adds zero transitive dependencies.

## Measured overhead

| Path | Cost |
|---|---|
| CLOSED, sequential | 38.87 ns/op, 0 allocs |
| CLOSED, contended (16 cores) | 97.19 ns/op, 0 allocs |
| OPEN (rejection) | 17.72 ns/op, 0 allocs |

Against an 8s network timeout. No goroutines are started — `gobreaker` advances
state lazily when a call arrives, not on a background ticker, and
`TestNoGoroutinesLeak` pins that.

## Adding another dependency

1. Give it a `breaker.Tuning` field in `config.Config` and a `breakerTuning("BREAKER_YOURDEP")` line in `Load()`.
2. Build the breaker in the client's constructor with an `IsFailure` that
   excludes that dependency's expected business errors. **This is the step to
   get right.**
3. Decide what an open circuit returns. Prefer whatever the existing failure
   path already returns, so opening changes timing and nothing else.
4. Pass `client.Breaker()` to `handlers.Health` in `main.go`.
5. Test the classification: a run of that dependency's normal errors must leave
   the circuit closed.

## Troubleshooting

- **A feature is quietly missing** — check `/health` for a circuit in `open`,
  then the log for the transition line and the failures before it.
- **A circuit opens under normal use** — its `IsFailure` is counting a business
  error. Check `failure` on `/health`: if it climbs while the dependency is
  fine, that is the bug.
- **A circuit never opens during a real outage** — the failures are being
  classified as business errors, or `..._FAILURES` is set too high.
- **Turnstile circuit open** — logins still work; bot checking is being skipped,
  exactly as it is today when Cloudflare is unreachable.
