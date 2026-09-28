// Knowledge serves the Wikipedia info card shown above search results, on
// hashtag and location pages, and under educational videos.
//
// The client calls this SEPARATELY from its search request and renders the
// result asynchronously. That separation is deliberate: search must never wait
// on Wikipedia, and a slow or failing knowledge lookup must never be able to
// delay or break a results page.
package handlers

import (
	"log"

	"github.com/gofiber/fiber/v2"

	"reelsoo/backend-go/internal/knowledge"
	"reelsoo/backend-go/internal/ratelimit"
)

type KnowledgeHandler struct {
	service *knowledge.Service
	limiter *ratelimit.Limiter
}

func NewKnowledgeHandler(s *knowledge.Service, l *ratelimit.Limiter) *KnowledgeHandler {
	return &KnowledgeHandler{service: s, limiter: l}
}

const (
	// Per-IP ceiling on knowledge lookups. Generous for a human typing in a
	// search box (the client debounces, and repeat topics are cache hits), but
	// a hard stop on someone scripting the endpoint to mine it.
	//
	// This protects OUR backend. It is not what protects Wikimedia - the cache
	// and the entity gate do that, and they sit behind this limit, so even an
	// attacker at exactly the limit generates almost no external traffic.
	knowledgeMaxPerMinute = 30
	knowledgeWindowSecs   = 60
)

/* ── GET /knowledge?q=... ────────────────────────────────────────────── */

// Show returns at most one Wikipedia summary for a free-text query.
//
// Always 200 on a successful lookup, including when nothing was found: the
// client hides the card on {"found": false}. A 404 would be wrong here - the
// endpoint worked, the topic simply has no article.
func (h *KnowledgeHandler) Show(c *fiber.Ctx) error {
	query := c.Query("q")
	if query == "" {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
			"success": false,
			"message": "The q parameter is required.",
		})
	}

	// Bound the input before it reaches the gate. Anything this long is not a
	// topic, and refusing early keeps a huge body from becoming a cache key.
	if len(query) > 200 {
		return c.JSON(fiber.Map{"success": true, "data": knowledge.Result{Found: false}})
	}

	ctx := c.Context()

	if h.limiter != nil {
		exceeded, err := h.limiter.TooManyAttempts(ctx,
			"knowledge:"+c.IP(), knowledgeMaxPerMinute, knowledgeWindowSecs)
		if err == nil && exceeded {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"success": false,
				"message": "Too many requests. Please slow down.",
			})
		}
		// A limiter error (Redis blip) is deliberately ignored: failing open on
		// a decorative endpoint beats failing closed and hiding every card.
	}

	result, err := h.service.Lookup(ctx, query)
	if err != nil {
		// Degrade to "no card". The detail goes to the log; the client gets a
		// normal empty result and simply renders nothing, so a Wikimedia
		// outage is invisible to users rather than an error on screen.
		log.Printf("knowledge: lookup failed for %q: %v", query, err)
		result = knowledge.Result{Found: false}
	}

	// Let the CDN and the browser hold the card too. These responses are
	// identical for every user, so edge caching removes most of the repeat
	// traffic before it ever reaches this process.
	if result.Found {
		c.Set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400")
	} else {
		// Misses are cached for less time, matching the negative TTL's intent.
		c.Set("Cache-Control", "public, max-age=600")
	}

	return c.JSON(fiber.Map{"success": true, "data": result})
}
