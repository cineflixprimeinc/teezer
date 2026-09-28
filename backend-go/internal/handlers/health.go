package handlers

import (
	"context"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"

	"reelsoo/backend-go/internal/breaker"
	"reelsoo/backend-go/internal/clickhouse"
)

// Health reports process liveness plus analytics ingestion counters.
//
// The counters are the only visibility there is into the event pipeline. The
// writer drops events when its buffer fills and logs a line nobody reads, so
// without this a ClickHouse outage looks exactly like a quiet day: the API stays
// up, requests keep succeeding, and the Studio charts simply stop moving. A
// rising `dropped` or `failed` is what distinguishes the two.
//
// `events` is nil-safe - an unset CLICKHOUSE_DSN reports zeros and
// enabled:false rather than omitting the block, so a probe can tell "ingestion
// is off" apart from "ingestion is on and healthy".
// Breakers is what Health reports circuit state from. An interface so the
// handler does not import every protected dependency's package.
type Breakers interface{ Stats() breaker.Stats }

func Health(pool *pgxpool.Pool, events *clickhouse.Writer, breakers ...Breakers) fiber.Handler {
	return func(c *fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(c.Context(), 2*time.Second)
		defer cancel()

		if err := pool.Ping(ctx); err != nil {
			// /health is unauthenticated, so the driver's error text must not go
			// out with the response: a pgx failure spells out the host, port,
			// database and user of the DSN, and a TLS failure adds the server's
			// certificate details. "down" is all a load balancer or uptime probe
			// needs; the cause goes to the log for whoever is on call.
			log.Printf("health: database ping failed: %v", err)
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
				"status": "down",
			})
		}
		enqueued, written, dropped, failed := events.Stats()

		// Circuit state is INFORMATIONAL and deliberately does not influence
		// `status`. An open circuit on an optional dependency means the
		// knowledge card is quietly absent or the bot check is being skipped -
		// this process is healthy and must keep taking traffic. Reporting
		// otherwise would have a Wikimedia outage pull Reelsoo's own API out
		// of the load balancer, which is the cascading failure the breakers
		// exist to prevent.
		circuits := make([]breaker.Stats, 0, len(breakers))
		for _, b := range breakers {
			if b != nil {
				circuits = append(circuits, b.Stats())
			}
		}

		return c.JSON(fiber.Map{
			"status": "ok",
			// Fixed dependency names only - no per-request values ever reach
			// these keys.
			"circuits": circuits,
			"analytics": fiber.Map{
				"enabled": events != nil,
				// Accepted from callers. The gap to `written` is what is still
				// buffered plus whatever was lost.
				"enqueued": enqueued,
				// Confirmed in ClickHouse.
				"written": written,
				// Refused because the buffer was full - ClickHouse is unreachable
				// or too slow. Non-zero means events are being lost right now.
				"dropped": dropped,
				// Accepted, then lost on insert. A batch that failed to prepare or
				// send. Also unrecoverable.
				"failed": failed,
			},
		})
	}
}
