package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"reelsoo/backend-go/internal/breaker"
	"time"
)

type Config struct {
	Host        string // bind address; default 127.0.0.1 so a stray deploy never faces the internet directly
	Port        string
	DatabaseURL string
	RedisURL    string // empty => rate limiting/dedup/cache-bust run in single-instance in-memory mode
	// Mirrors config/text_moderation.php. Enabled by default, matching Laravel.
	TextModerationEnabled         bool
	TextModerationReviewThreshold int
	TurnstileSecretKey            string // empty => Turnstile verification disabled (fails open), matches Laravel's services.turnstile.secret default
	AppKey                        string // Laravel APP_KEY ("base64:..."), required to decrypt users.two_factor_secret for 2FA verification
	MediaBaseURL                  string // public base for stored media (Laravel Storage::url), e.g. https://cdn.teezer.live; empty => raw storage keys returned
	MediaSigningSecret            string // Laravel services.media.signing_secret (MEDIA_SIGNING_SECRET) - HMAC key the CDN Worker validates signed video/quality URLs against

	// Backblaze B2 write credentials - the b2 disk in Laravel's
	// config/filesystems.php, same keys, same bucket, same object key layout,
	// so an object written by either backend is readable by the other. Empty =>
	// upload endpoints return a clean 503; the rest of the API is unaffected.
	MediaStoreAccessKeyID     string
	MediaStoreSecretAccessKey string
	MediaStoreBucket          string
	MediaStoreEndpoint        string
	MediaStoreRegion          string

	// Circuit breakers for the two outbound dependencies that have one:
	// Wikimedia (knowledge cards) and Cloudflare Turnstile (bot check). Per
	// process, not shared - see internal/breaker's package comment.
	//
	// Defaults suit an optional dependency whose failure degrades a feature.
	// Env: BREAKER_WIKIPEDIA_* and BREAKER_TURNSTILE_* with suffixes
	// FAILURES, RECOVERY_SECONDS, HALF_OPEN_PROBES, WINDOW_SECONDS.
	WikipediaBreaker breaker.Tuning
	TurnstileBreaker breaker.Tuning

	// ClickHouseDSN points at the analytics event store, e.g.
	// clickhouse://reelsoo:pass@127.0.0.1:9000/reelsoo.
	//
	// Empty => analytics ingestion is DISABLED and the backend behaves exactly as
	// it did before ClickHouse existed (Postgres-only). This is the kill switch:
	// unset it and redeploy to back the feature out with no code change.
	ClickHouseDSN string

	// NATS JetStream internal event bus (see internal/events). Empty NatsURL
	// => Go-originated realtime publishing is disabled (no-op), same
	// degrade-gracefully rule as ClickHouseDSN - never blocks boot.
	NatsURL string
	// CentrifugoAPIURL/Key mirror Laravel's services.centrifugo.api_url/
	// api_key (CENTRIFUGO_API_URL / CENTRIFUGO_API_KEY) exactly - the SAME
	// Centrifugo instance, same credentials, so events published from Go
	// land in the identical channels Laravel already broadcasts to.
	CentrifugoAPIURL string
	CentrifugoAPIKey string
}

func Load() Config {
	cfg := Config{
		Host:                          getEnv("HOST", "127.0.0.1"),
		Port:                          getEnv("PORT", "8081"),
		DatabaseURL:                   os.Getenv("DATABASE_URL"),
		RedisURL:                      os.Getenv("REDIS_URL"),
		TurnstileSecretKey:            os.Getenv("TURNSTILE_SECRET_KEY"),
		TextModerationEnabled:         getEnvBool("TEXT_MODERATION_ENABLED", true),
		TextModerationReviewThreshold: getEnvInt("TEXT_MODERATION_REVIEW_THRESHOLD", 2),
		AppKey:                        os.Getenv("APP_KEY"),
		// Mirrors Laravel's b2 disk 'url' (MEDIA_URL, e.g.
		// https://cdn.teezer.live) - the CDN host, never the bucket endpoint.
		MediaBaseURL:       strings.TrimRight(os.Getenv("MEDIA_URL"), "/"),
		MediaSigningSecret: os.Getenv("MEDIA_SIGNING_SECRET"),
		ClickHouseDSN:      os.Getenv("CLICKHOUSE_DSN"),

		WikipediaBreaker: breakerTuning("BREAKER_WIKIPEDIA"),
		TurnstileBreaker: breakerTuning("BREAKER_TURNSTILE"),
		NatsURL:          os.Getenv("NATS_URL"),
		CentrifugoAPIURL: getEnv("CENTRIFUGO_API_URL", "http://127.0.0.1:8000"),
		CentrifugoAPIKey: os.Getenv("CENTRIFUGO_API_KEY"),

		MediaStoreAccessKeyID:     os.Getenv("B2_APPLICATION_KEY_ID"),
		MediaStoreSecretAccessKey: os.Getenv("B2_APPLICATION_KEY"),
		MediaStoreBucket:          os.Getenv("B2_BUCKET"),
		MediaStoreEndpoint:        os.Getenv("B2_ENDPOINT"),
		// B2_REGION is optional: the region is already spelled out in the
		// endpoint host, and requiring both invites the failure where they
		// disagree and every request fails SigV4 naming neither.
		MediaStoreRegion: getEnv("B2_REGION", regionFromB2Endpoint(os.Getenv("B2_ENDPOINT"))),
	}

	if cfg.DatabaseURL == "" {
		cfg.DatabaseURL = fmt.Sprintf(
			"postgres://%s:%s@%s:%s/%s?sslmode=%s",
			getEnv("DB_PGSQL_USERNAME", "teezer"),
			getEnv("DB_PGSQL_PASSWORD", ""),
			getEnv("DB_PGSQL_HOST", "127.0.0.1"),
			getEnv("DB_PGSQL_PORT", "5432"),
			getEnv("DB_PGSQL_DATABASE", "teezer"),
			getEnv("DB_PGSQL_SSLMODE", "disable"),
		)
	}

	return cfg
}

// Validate refuses to hand back a config that would start the service in a
// state it cannot actually serve from. Called by main before anything connects.
//
// Deliberately narrow, mirroring AppServiceProvider::assertCriticalConfig() on
// the Laravel side: a guard that demanded every key would turn one unset
// optional variable into an outage, which is worse than the problem it
// prevents. Everything optional here already degrades on purpose - an empty
// REDIS_URL falls back to in-memory, an empty CLICKHOUSE_DSN disables
// analytics, an empty NATS_URL disables realtime publishing - and none of
// those should ever block boot.
//
// APP_KEY is absent from this list on purpose: laravelcrypt.New already
// rejects an empty or malformed key in main, with a better message than a
// generic "missing" would give.
func (c Config) Validate() error {
	var missing []string

	// The DSN is assembled from DB_PGSQL_* when DATABASE_URL is unset, and
	// getEnv defaults the password to "". That combination is the dangerous
	// one: it yields a syntactically valid DSN carrying no password at all, so
	// instead of a clear configuration error you get either a confusing SASL
	// failure at runtime or - against a trust-auth server - a silent connection
	// as a superuser nobody intended. Fail here, where the cause is obvious.
	if c.DatabaseURL == "" {
		missing = append(missing, "DATABASE_URL (or the DB_PGSQL_* set it is assembled from)")
	} else if os.Getenv("DATABASE_URL") == "" && os.Getenv("DB_PGSQL_PASSWORD") == "" {
		missing = append(missing, "DB_PGSQL_PASSWORD - unset, so the assembled DSN carries an empty password")
	}

	if len(missing) > 0 {
		return fmt.Errorf(
			"refusing to start: required configuration is missing:\n  - %s",
			strings.Join(missing, "\n  - "),
		)
	}

	return nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

// regionFromB2Endpoint pulls the region out of a Backblaze S3 endpoint host -
// "https://s3.us-west-004.backblazeb2.com" yields "us-west-004".
//
// It exists so B2_REGION is optional: the region is already spelled out in the
// endpoint, and requiring both invites the failure where they disagree and
// every request fails SigV4 with an error that names neither. An unrecognised
// shape returns "" so the caller surfaces a missing region rather than signing
// with a guess.
func regionFromB2Endpoint(endpoint string) string {
	host := endpoint
	if i := strings.Index(host, "://"); i >= 0 {
		host = host[i+3:]
	}
	host = strings.TrimSuffix(strings.SplitN(host, "/", 2)[0], ".")

	parts := strings.Split(host, ".")
	// Expect s3.<region>.backblazeb2.com
	if len(parts) >= 4 && parts[0] == "s3" && strings.HasSuffix(host, "backblazeb2.com") {
		return parts[1]
	}
	return ""
}

// getEnvBool reads a boolean env var, accepting the same truthy spellings
// Laravel's env() does. An unset or unparseable value falls back to def.
func getEnvBool(key string, def bool) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	switch v {
	case "":
		return def
	case "1", "true", "on", "yes":
		return true
	case "0", "false", "off", "no":
		return false
	default:
		return def
	}
}

// getEnvInt reads an int env var, falling back to def when unset or invalid.
func getEnvInt(key string, def int) int {
	if n, err := strconv.Atoi(strings.TrimSpace(os.Getenv(key))); err == nil {
		return n
	}
	return def
}

// breakerTuning reads one dependency's circuit-breaker knobs, falling back to
// breaker.DefaultTuning() for anything unset - so an unconfigured deployment
// gets working defaults rather than a circuit that trips on the first failure
// (threshold 0) or never recovers (timeout 0).
func breakerTuning(prefix string) breaker.Tuning {
	d := breaker.DefaultTuning()

	return breaker.Tuning{
		ConsecutiveFailures: uint32(getEnvInt(prefix+"_FAILURES", int(d.ConsecutiveFailures))),
		RecoveryTimeout:     time.Duration(getEnvInt(prefix+"_RECOVERY_SECONDS", int(d.RecoveryTimeout/time.Second))) * time.Second,
		HalfOpenProbes:      uint32(getEnvInt(prefix+"_HALF_OPEN_PROBES", int(d.HalfOpenProbes))),
		CountWindow:         time.Duration(getEnvInt(prefix+"_WINDOW_SECONDS", int(d.CountWindow/time.Second))) * time.Second,
	}
}
