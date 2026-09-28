package database

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	// This service's declared share of Postgres' 100 connections; the rest is
	// left for PHP-FPM, the worker box and an operator's psql.
	maxConns int32 = 10
	// A small warm floor so a burst after an idle period is not paying for
	// connection setup on the first requests.
	minConns int32 = 2
	// Milliseconds, as Postgres expects the parameter.
	statementTimeoutMS = "30000"
)

// Connect opens the pool with every session forced to UTC. Laravel's
// migrations use tz-naive "timestamp" columns, and pgx decodes those as
// bare wall-clock digits with no offset - if the Postgres server's own
// timezone isn't UTC (e.g. Asia/Kathmandu locally, CEST on the VPS boxes),
// now() writes local wall-clock digits that pgx then treats as UTC, and
// any Go-side time.Now() comparison against a decoded column silently
// skews by the server's UTC offset. Forcing the session to UTC makes what
// Postgres writes match what Go assumes on read.
func Connect(ctx context.Context, url string) (*pgxpool.Pool, error) {
	poolCfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	poolCfg.ConnConfig.RuntimeParams["timezone"] = "UTC"

	// Pool sizing, stated rather than inherited.
	//
	// Nothing was set here, so the pool ran on pgx's defaults: MaxConns =
	// max(4, NumCPU) - which is whatever the box happens to have - and MinConns
	// 0, meaning every quiet period drained the pool and the next request paid
	// for a fresh connect + TLS + auth. Postgres allows 100 connections in
	// total and is shared with PHP-FPM and the worker box, so this service's
	// share is declared explicitly instead of scaling with core count on
	// whatever machine it lands on.
	if poolCfg.MaxConns < 1 || poolCfg.MaxConns > maxConns {
		poolCfg.MaxConns = maxConns
	}
	poolCfg.MinConns = minConns
	// Recycled well before any server-side idle reaper or load-balancer idle
	// timeout can close one underneath us, so a connection is never handed to a
	// query after the far end has quietly gone away.
	poolCfg.MaxConnLifetime = 30 * time.Minute
	poolCfg.MaxConnIdleTime = 5 * time.Minute
	poolCfg.HealthCheckPeriod = 1 * time.Minute

	// No single query may pin a pooled connection indefinitely. Set on the
	// connection rather than per call site so it cannot be forgotten at one.
	poolCfg.ConnConfig.RuntimeParams["statement_timeout"] = statementTimeoutMS

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	return pool, nil
}
