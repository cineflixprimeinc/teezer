// Package wikipedia is a thin client for the official Wikimedia REST API.
//
// No SDK and no API key: the summary endpoint is public and anonymous. What
// Wikimedia asks for in return is a descriptive User-Agent identifying the
// caller, which their policy treats as mandatory - anonymous traffic without
// one gets throttled or blocked outright. That header is set on every request
// here and is not optional.
//
// The client only knows how to fetch and parse. It does no caching and no
// rate limiting; those belong to internal/knowledge, which is the only thing
// that should ever construct one.
package wikipedia

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"reelsoo/backend-go/internal/breaker"
)

// UserAgent identifies Teezer to Wikimedia. Their User-Agent policy asks for
// an application name and a way to make contact, so an operator on their side
// can reach someone before resorting to a block.
const UserAgent = "Teezer/1.0 (contact: support@teezer.live)"

// ErrNotFound means Wikimedia answered successfully and the answer was "there
// is no usable article for this". It is a cacheable result, not a failure -
// the caller stores it as a negative entry so the same query never asks again.
var ErrNotFound = errors.New("wikipedia: no article for this query")

// Article is the whole of what we keep and the whole of what a client is ever
// shown. Deliberately four fields: anything more would make this a mirror of
// Wikipedia rather than a cache of it.
type Article struct {
	Title      string `json:"title"`
	Summary    string `json:"summary"`
	Thumbnail  string `json:"thumbnail"`
	ArticleURL string `json:"article_url"`
}

type Client struct {
	http *http.Client
	// Circuit for the Wikimedia origin. Guards Summary as a whole, not the
	// individual GETs, because one Summary can fan out to three requests each
	// retrying twice - during an outage that is up to nine attempts and ~24s of
	// wall clock for a decorative card nobody will see.
	cb *breaker.Breaker
	// Base hosts are fields rather than constants so tests can point them at a
	// local server without touching the network.
	restBase   string // per-language REST: https://en.wikipedia.org/api/rest_v1
	searchBase string // cross-wiki core REST: https://api.wikimedia.org/core/v1
	maxRetries int
}

func New(cb breaker.Tuning) *Client {
	return &Client{
		// A per-request ceiling. Wikimedia is fast; a slow response means
		// something is wrong, and a knowledge card is never worth making a
		// user wait. The caller applies its own shorter deadline on top.
		http:       &http.Client{Timeout: 8 * time.Second},
		restBase:   "https://en.wikipedia.org/api/rest_v1",
		searchBase: "https://api.wikimedia.org/core/v1",
		maxRetries: 2,
		cb: breaker.New(breaker.Settings{
			Name:                "wikipedia",
			ConsecutiveFailures: cb.ConsecutiveFailures,
			RecoveryTimeout:     cb.RecoveryTimeout,
			HalfOpenProbes:      cb.HalfOpenProbes,
			CountWindow:         cb.CountWindow,
			// ErrNotFound is Wikimedia answering correctly: the article does
			// not exist. Counting it would open the circuit on a run of
			// unknown search terms - switching a perfectly healthy dependency
			// off because users searched for things that are not encyclopedia
			// articles. Everything else (transport, DNS, TLS, timeout, 5xx,
			// 429, an undecodable body) is the dependency failing.
			IsFailure: func(err error) bool { return !errors.Is(err, ErrNotFound) },
		}),
	}
}

// Summary resolves a free-text query to one article.
//
// Two steps, in the order that makes the common case cheapest:
//
//  1. Ask for the summary of the query as if it were a title. Wikipedia
//     normalises case and follows redirects itself, so "mount everest",
//     "Mount Everest" and "Everest" all land on the same page in ONE request.
//  2. Only if that 404s, use the search endpoint to turn the query into a real
//     title and fetch that.
//
// So an exact-ish query costs one call and a fuzzy one costs two - and either
// way the result is cached, so it happens once per topic, not once per search.
func (c *Client) Summary(ctx context.Context, query string) (*Article, error) {
	// One circuit around the whole lookup. When it is open this returns
	// breaker.ErrOpen without touching the network; knowledge.Service already
	// treats any non-ErrNotFound error as "fetch failed", so it declines to
	// write a negative cache entry and the handler degrades to an empty card -
	// exactly what a real Wikimedia failure does today, minus the wait.
	return breaker.Do(c.cb, func() (*Article, error) {
		return c.summary(ctx, query)
	})
}

func (c *Client) summary(ctx context.Context, query string) (*Article, error) {
	article, err := c.summaryByTitle(ctx, query)
	if err == nil {
		return article, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return nil, err
	}

	title, err := c.searchTitle(ctx, query)
	if err != nil {
		return nil, err
	}
	// Nothing matched, or search echoed back the title we already tried - in
	// which case a second identical fetch would just be a wasted round trip.
	if title == "" || strings.EqualFold(title, query) {
		return nil, ErrNotFound
	}

	return c.summaryByTitle(ctx, title)
}

// summaryResponse is the subset of the REST summary payload we read. The real
// response carries far more (coordinates, revision ids, multiple image sizes);
// naming only these four keeps us insulated from changes to the rest.
type summaryResponse struct {
	Type         string `json:"type"`
	Title        string `json:"title"`
	DisplayTitle string `json:"displaytitle"`
	Extract      string `json:"extract"`
	Thumbnail    struct {
		Source string `json:"source"`
	} `json:"thumbnail"`
	ContentURLs struct {
		Desktop struct {
			Page string `json:"page"`
		} `json:"desktop"`
	} `json:"content_urls"`
}

func (c *Client) summaryByTitle(ctx context.Context, title string) (*Article, error) {
	// PathEscape, not QueryEscape: the title is a path segment, and
	// QueryEscape would turn a space into "+" which Wikipedia reads literally.
	endpoint := fmt.Sprintf("%s/page/summary/%s", c.restBase, url.PathEscape(normaliseTitle(title)))

	body, err := c.get(ctx, endpoint)
	if err != nil {
		return nil, err
	}

	var payload summaryResponse
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("wikipedia: decode summary: %w", err)
	}

	// A disambiguation page ("Mercury may refer to...") is not knowledge, it
	// is a menu - showing it as a fact card would be worse than showing
	// nothing. Same for a page with no extract to display.
	if payload.Type == "disambiguation" || strings.TrimSpace(payload.Extract) == "" {
		return nil, ErrNotFound
	}

	resolvedTitle := payload.Title
	if resolvedTitle == "" {
		resolvedTitle = title
	}

	articleURL := payload.ContentURLs.Desktop.Page
	if articleURL == "" {
		articleURL = "https://en.wikipedia.org/wiki/" + url.PathEscape(normaliseTitle(resolvedTitle))
	}

	return &Article{
		Title:      resolvedTitle,
		Summary:    strings.TrimSpace(payload.Extract),
		Thumbnail:  payload.Thumbnail.Source,
		ArticleURL: articleURL,
	}, nil
}

type searchResponse struct {
	Pages []struct {
		Key   string `json:"key"`
		Title string `json:"title"`
	} `json:"pages"`
}

// searchTitle turns free text into the best-matching article title using the
// Wikimedia Core REST search endpoint. limit=1 because we only ever show one
// card, and asking for more would be bandwidth spent on results we discard.
func (c *Client) searchTitle(ctx context.Context, query string) (string, error) {
	endpoint := fmt.Sprintf("%s/wikipedia/en/search/title?q=%s&limit=1",
		c.searchBase, url.QueryEscape(query))

	body, err := c.get(ctx, endpoint)
	if err != nil {
		// A miss on search is a miss overall, not an error worth surfacing.
		if errors.Is(err, ErrNotFound) {
			return "", nil
		}
		return "", err
	}

	var payload searchResponse
	if err := json.Unmarshal(body, &payload); err != nil {
		return "", fmt.Errorf("wikipedia: decode search: %w", err)
	}
	if len(payload.Pages) == 0 {
		return "", nil
	}

	if t := payload.Pages[0].Title; t != "" {
		return t, nil
	}
	return payload.Pages[0].Key, nil
}

// get performs one GET with the mandatory User-Agent, retrying only the
// failures that are actually worth retrying.
//
// Retry policy, deliberately narrow:
//   - 429 and 5xx are transient, so they back off and retry.
//   - 404 is a real answer (ErrNotFound) and must never be retried - retrying
//     misses is precisely the abusive pattern the caching layer exists to
//     avoid.
//   - Any other 4xx is our bug, and repeating a malformed request would not
//     fix it.
//
// Backoff is exponential (500ms, 1s, 2s...) and honours a Retry-After header
// when Wikimedia sends one, because their stated wait beats our guess.
func (c *Client) get(ctx context.Context, endpoint string) ([]byte, error) {
	var lastErr error

	for attempt := 0; attempt <= c.maxRetries; attempt++ {
		if attempt > 0 {
			delay := time.Duration(500*(1<<(attempt-1))) * time.Millisecond
			if ra := retryAfter(lastErr); ra > 0 {
				delay = ra
			}
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(delay):
			}
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			return nil, fmt.Errorf("wikipedia: build request: %w", err)
		}
		req.Header.Set("User-Agent", UserAgent)
		req.Header.Set("Accept", "application/json")
		// Accept-Encoding is deliberately NOT set here. net/http adds gzip on
		// its own and transparently decompresses the response - but ONLY when
		// it added the header itself. Setting it manually opts into handling
		// the encoding yourself, so the body arrives still compressed and the
		// JSON decoder dies on the gzip magic byte with
		// "invalid character '\x1f' looking for beginning of value".
		// We still get gzip on the wire; we just let the transport own it.

		resp, err := c.http.Do(req)
		if err != nil {
			// Transport-level failure (DNS, TLS, timeout) - worth one more go.
			lastErr = fmt.Errorf("wikipedia: request: %w", err)
			continue
		}

		// Cap the read. A summary is a couple of KB; anything vastly larger is
		// a wrong endpoint or a hostile response, and neither should be able
		// to balloon this process's memory.
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		resp.Body.Close()

		switch {
		case resp.StatusCode == http.StatusNotFound:
			return nil, ErrNotFound
		case resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500:
			lastErr = &httpError{status: resp.StatusCode, retryAfter: parseRetryAfter(resp.Header.Get("Retry-After"))}
			continue
		case resp.StatusCode >= 400:
			return nil, fmt.Errorf("wikipedia: unexpected status %d", resp.StatusCode)
		}

		if readErr != nil {
			lastErr = fmt.Errorf("wikipedia: read body: %w", readErr)
			continue
		}
		return body, nil
	}

	return nil, lastErr
}

type httpError struct {
	status     int
	retryAfter time.Duration
}

func (e *httpError) Error() string {
	return fmt.Sprintf("wikipedia: upstream status %d", e.status)
}

func retryAfter(err error) time.Duration {
	var he *httpError
	if errors.As(err, &he) {
		return he.retryAfter
	}
	return 0
}

// parseRetryAfter reads the delay-seconds form of Retry-After. The HTTP-date
// form is ignored on purpose: Wikimedia sends seconds, and mis-parsing a date
// into a multi-hour sleep would be worse than falling back to our own backoff.
func parseRetryAfter(v string) time.Duration {
	if v == "" {
		return 0
	}
	var secs int
	if _, err := fmt.Sscanf(v, "%d", &secs); err != nil || secs <= 0 {
		return 0
	}
	// Never wait longer than a request is worth.
	if secs > 30 {
		secs = 30
	}
	return time.Duration(secs) * time.Second
}

// normaliseTitle converts a query to Wikipedia's path form: underscores for
// spaces. Case is left alone - Wikipedia resolves it, and forcing title case
// would break articles like "iPhone" or "eBay".
func normaliseTitle(s string) string {
	return strings.ReplaceAll(strings.TrimSpace(s), " ", "_")
}

// Breaker exposes the circuit for the health endpoint's informational
// reporting. Read-only: nothing outside this package may drive its state.
func (c *Client) Breaker() *breaker.Breaker { return c.cb }
