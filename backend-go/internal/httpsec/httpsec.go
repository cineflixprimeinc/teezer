// Package httpsec holds the two cross-cutting HTTP concerns the Go API was
// missing next to its Laravel counterpart: response security headers, and an
// error handler that never lets internal detail reach a client.
//
// Both exist in Laravel already - SecurityHeaders middleware and the catch-all
// render() in bootstrap/app.php - and this package deliberately mirrors their
// behaviour rather than inventing its own, so a response means the same thing
// whichever backend served it.
package httpsec

import (
	"errors"
	"log"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// Headers sets the same response headers as Laravel's SecurityHeaders
// middleware. Registered as the first middleware so it applies to every
// response, including 404s and errors produced by ErrorHandler.
//
// The CSP is the JSON-API policy from that middleware, not the Blade one:
// everything this service returns is JSON, so nothing should ever be loaded or
// executed from a response. 'none' across the board is both the strictest
// possible policy and the one with nothing to break.
func Headers() fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Run the rest of the chain first, then stamp the headers on whatever
		// came back - so they land on error responses too, not just handlers
		// that returned normally.
		err := c.Next()

		// By pointer: ResponseHeader carries a noCopy guard, and taking it by
		// value would both trip vet and mutate a throwaway copy.
		h := &c.Response().Header
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		h.Set("Content-Security-Policy",
			"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")

		// Fiber advertises itself by default; there is no reason to tell a
		// scanner which server and version it is talking to.
		h.Del("Server")
		h.Del("X-Powered-By")

		return err
	}
}

// ErrorHandler replaces Fiber's default, which writes err.Error() straight into
// the response body. For a *fiber.Error (404, 405, a handler's explicit
// fiber.NewError) that text is already client-safe and is passed through. For
// anything else - a pgx failure, a nil map write recovered by the recover
// middleware, a type assertion panic - the text can carry a query, a DSN, or a
// file path, so the client gets a fixed message plus a correlation id and the
// real error goes to the log under that same id.
func ErrorHandler(c *fiber.Ctx, err error) error {
	// Fiber's own errors are status-code-with-a-reason ("Cannot GET /nope") and
	// carry nothing internal, so they keep their status and message.
	var fe *fiber.Error
	if errors.As(err, &fe) {
		return c.Status(fe.Code).JSON(fiber.Map{
			"success": false,
			"message": fe.Message,
		})
	}

	correlationID := uuid.NewString()

	log.Printf("unhandled error: correlation_id=%s method=%s path=%s err=%v",
		correlationID, c.Method(), c.Path(), err)

	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
		"success":        false,
		"message":        "An unexpected error occurred. Please try again.",
		"correlation_id": correlationID,
	})
}
