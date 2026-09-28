// Package turnstile ports App\Services\TurnstileService: Cloudflare
// Turnstile bot-check verification. Fails OPEN (allow) on any config/network
// problem - only a genuinely missing/invalid challenge response fails
// closed - same rule Laravel applies, so a Cloudflare outage or a wrong
// secret never locks real users out.
package turnstile

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"reelsoo/backend-go/internal/breaker"
)

const verifyURL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

type Service struct {
	secret string
	client *http.Client
	cb     *breaker.Breaker
}

// errTransport marks the failures that mean "Cloudflare is not answering", as
// opposed to "Cloudflare answered and the token was bad". Only the former may
// open the circuit: a wrong or replayed token is the check working.
var errTransport = errors.New("turnstile: verify request failed")

func New(secret string, cb breaker.Tuning) *Service {
	return &Service{
		secret: strings.TrimSpace(secret),
		client: &http.Client{Timeout: 8 * time.Second},
		cb: breaker.New(breaker.Settings{
			Name:                "turnstile",
			ConsecutiveFailures: cb.ConsecutiveFailures,
			RecoveryTimeout:     cb.RecoveryTimeout,
			HalfOpenProbes:      cb.HalfOpenProbes,
			CountWindow:         cb.CountWindow,
			// Only transport failures count. A failed challenge is a normal,
			// expected answer and must never switch bot protection off.
			IsFailure: func(err error) bool { return errors.Is(err, errTransport) },
		}),
	}
}

func (s *Service) Enabled() bool { return s.secret != "" }

// Result mirrors TurnstileService::verify()'s {ok, config_error} shape.
type Result struct {
	OK          bool
	ConfigError bool
}

func (s *Service) Verify(ctx context.Context, token, ip string) Result {
	if !s.Enabled() {
		return Result{OK: true}
	}
	if token == "" {
		return Result{OK: false}
	}

	// Under the circuit. This endpoint has no retry, so the breaker is not
	// here to stop amplification - it is here to stop every login paying the
	// 8s client timeout while Cloudflare is unreachable.
	//
	// The open-circuit answer is deliberately the SAME value a transport
	// failure already returns today, {OK:false, ConfigError:true}, which
	// AuthHandler treats as "allow through" (see `!result.OK &&
	// !result.ConfigError`). So an open circuit changes the timing and nothing
	// else: identical behaviour, without the wait. Failing closed here would
	// lock every real user out during a Cloudflare incident, which is exactly
	// what this package's fail-open rule exists to prevent.
	res, err := breaker.Do(s.cb, func() (Result, error) {
		return s.verify(ctx, token, ip)
	})
	if errors.Is(err, breaker.ErrOpen) {
		return Result{OK: false, ConfigError: true}
	}

	return res
}

// verify performs the actual call. It returns errTransport alongside the
// fail-open Result when Cloudflare could not be reached, so the circuit can
// count it while the caller still gets the same answer as before.
func (s *Service) verify(ctx context.Context, token, ip string) (Result, error) {
	form := url.Values{"secret": {s.secret}, "response": {token}}
	if ip != "" {
		form.Set("remoteip", ip)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, verifyURL, strings.NewReader(form.Encode()))
	if err != nil {
		// Building the request failed - our bug, not Cloudflare's. Not counted.
		return Result{OK: false, ConfigError: true}, nil
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := s.client.Do(req)
	if err != nil {
		log.Printf("turnstile verify request failed, failing open: %v", err)
		return Result{OK: false, ConfigError: true}, errTransport
	}
	defer resp.Body.Close()

	var body struct {
		Success    bool     `json:"success"`
		ErrorCodes []string `json:"error-codes"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		// Cloudflare answered with something undecodable - treat as the
		// dependency misbehaving.
		return Result{OK: false, ConfigError: true}, errTransport
	}
	if body.Success {
		return Result{OK: true}, nil
	}

	configErrors := map[string]bool{
		"invalid-input-secret": true, "missing-input-secret": true,
		"bad-request": true, "internal-error": true,
	}
	for _, e := range body.ErrorCodes {
		if configErrors[e] {
			// A misconfigured secret is our problem and repeating the call
			// will not fix it, but it is not Cloudflare being down either -
			// so it fails open, as before, and does not open the circuit.
			log.Printf("turnstile config error, failing open: %v", body.ErrorCodes)
			return Result{OK: false, ConfigError: true}, nil
		}
	}

	// Cloudflare answered: the challenge simply did not pass.
	return Result{OK: false}, nil
}

// Breaker exposes the circuit for the health endpoint's informational
// reporting. Read-only: nothing outside this package may drive its state.
func (s *Service) Breaker() *breaker.Breaker { return s.cb }
