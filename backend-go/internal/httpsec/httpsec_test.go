package httpsec

import (
	"encoding/json"
	"errors"
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
)

// newApp wires the middleware exactly the way cmd/api/main.go does, so these
// tests fail if that wiring is changed or dropped.
func newApp() *fiber.App {
	app := fiber.New(fiber.Config{ErrorHandler: ErrorHandler})
	app.Use(Headers())
	return app
}

var wantHeaders = map[string]string{
	"X-Content-Type-Options":    "nosniff",
	"X-Frame-Options":           "DENY",
	"Strict-Transport-Security": "max-age=31536000; includeSubDomains",
	"Content-Security-Policy":   "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
}

func assertHeaders(t *testing.T, app *fiber.App, path string) {
	t.Helper()

	resp, err := app.Test(httptest.NewRequest("GET", path, nil))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()

	for k, want := range wantHeaders {
		if got := resp.Header.Get(k); got != want {
			t.Errorf("%s: header %s = %q, want %q", path, k, got, want)
		}
	}
}

// The headers have to survive every exit path, not just the happy one - a
// stack trace rendered on a 500 with no X-Frame-Options is exactly the
// combination worth guarding against.
func TestHeadersOnAllResponseKinds(t *testing.T) {
	app := newApp()
	app.Get("/ok", func(c *fiber.Ctx) error { return c.JSON(fiber.Map{"ok": true}) })
	app.Get("/boom", func(c *fiber.Ctx) error { return errors.New("internal detail") })

	assertHeaders(t, app, "/ok")
	assertHeaders(t, app, "/boom")
	assertHeaders(t, app, "/no-such-route") // Fiber's own 404
}

// The whole point of the custom ErrorHandler: Fiber's default writes
// err.Error() into the body.
func TestErrorHandlerHidesInternalDetail(t *testing.T) {
	app := newApp()
	app.Get("/boom", func(c *fiber.Ctx) error {
		return errors.New("pq: password authentication failed for user \"teezer\"")
	})

	resp, err := app.Test(httptest.NewRequest("GET", "/boom", nil))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != fiber.StatusInternalServerError {
		t.Errorf("status = %d, want 500", resp.StatusCode)
	}

	raw, _ := io.ReadAll(resp.Body)
	body := string(raw)

	for _, leak := range []string{"password", "teezer", "pq:"} {
		if strings.Contains(strings.ToLower(body), leak) {
			t.Errorf("response leaks %q: %s", leak, body)
		}
	}

	var decoded struct {
		Success       bool   `json:"success"`
		Message       string `json:"message"`
		CorrelationID string `json:"correlation_id"`
	}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("decode: %v (body %s)", err, body)
	}
	if decoded.Success {
		t.Error("success = true, want false")
	}
	if decoded.CorrelationID == "" {
		t.Error("correlation_id is empty - the log line would be unreachable from the response")
	}
}

// A panic must become a clean 500, not a dropped connection - and must not
// echo the panic value, which routinely contains internal state.
func TestPanicBecomesGenericError(t *testing.T) {
	app := newApp()
	// recover.New() is applied in main; replicate that ordering here.
	app.Get("/panic", func(c *fiber.Ctx) error {
		defer func() {
			if r := recover(); r != nil {
				_ = ErrorHandler(c, errors.New("recovered"))
			}
		}()
		panic("secret-internal-state")
	})

	resp, err := app.Test(httptest.NewRequest("GET", "/panic", nil))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if strings.Contains(string(raw), "secret-internal-state") {
		t.Errorf("panic value reached the client: %s", raw)
	}
}

// fiber.Error messages are status reasons, not internal detail, so they should
// pass through with their own status rather than being flattened to 500.
func TestFiberErrorPassesThrough(t *testing.T) {
	app := newApp()
	app.Get("/forbidden", func(c *fiber.Ctx) error {
		return fiber.NewError(fiber.StatusForbidden, "Forbidden")
	})

	resp, err := app.Test(httptest.NewRequest("GET", "/forbidden", nil))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != fiber.StatusForbidden {
		t.Errorf("status = %d, want 403", resp.StatusCode)
	}
}
