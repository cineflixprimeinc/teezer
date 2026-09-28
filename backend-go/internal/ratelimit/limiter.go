// Package ratelimit reproduces the two rate-limiting primitives Laravel
// used for this endpoint: RateLimiter::tooManyAttempts/hit (fixed window,
// used both for the route's throttle:300,1 and the controller's per-event
// -type limits) and Cache::has/put (used for de-dupe and job debounce).
//
// Backed by Redis when configured so limits hold across multiple instances,
// matching production. Falls back to an in-process store for local/single
// -instance dev, which is why a REDIS_URL is required before this can be
// trusted horizontally.
package ratelimit

import (
	"context"
	"strconv"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

type Limiter struct {
	rdb *redis.Client

	mu     sync.Mutex
	hits   map[string]*window
	marks  map[string]time.Time
	values map[string]entry
}

type window struct {
	count     int
	expiresAt time.Time
}

type entry struct {
	value     string
	expiresAt time.Time
}

func New(rdb *redis.Client) *Limiter {
	return &Limiter{
		rdb:    rdb,
		hits:   make(map[string]*window),
		marks:  make(map[string]time.Time),
		values: make(map[string]entry),
	}
}

// Hit increments the counter for key within a decaySeconds window and
// reports whether the caller has now exceeded maxAttempts. Mirrors
// RateLimiter::tooManyAttempts + RateLimiter::hit, checked before acting.
func (l *Limiter) TooManyAttempts(ctx context.Context, key string, maxAttempts int, decaySeconds int) (bool, error) {
	if l.rdb != nil {
		full := "ratelimit:" + key
		count, err := l.rdb.Incr(ctx, full).Result()
		if err != nil {
			return false, err
		}
		if count == 1 {
			l.rdb.Expire(ctx, full, time.Duration(decaySeconds)*time.Second)
		}
		return int(count) > maxAttempts, nil
	}

	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	w, ok := l.hits[key]
	if !ok || now.After(w.expiresAt) {
		w = &window{count: 0, expiresAt: now.Add(time.Duration(decaySeconds) * time.Second)}
		l.hits[key] = w
	}
	w.count++
	return w.count > maxAttempts, nil
}

// SeenRecently reports whether key was marked within the last ttl, then
// marks it. Mirrors the like/save/follow_from_video dedupe use of
// Cache::has + Cache::put.
func (l *Limiter) SeenRecently(ctx context.Context, key string, ttl time.Duration) (bool, error) {
	if l.rdb != nil {
		full := "dedupe:" + key
		ok, err := l.rdb.SetNX(ctx, full, 1, ttl).Result()
		if err != nil {
			return false, err
		}
		return !ok, nil // SetNX succeeded => key was NOT already present
	}

	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	if last, ok := l.marks[key]; ok && now.Before(last) {
		return true, nil
	}
	l.marks[key] = now.Add(ttl)
	return false, nil
}

// Put/Get/Delete/Incr back the 2FA challenge cache: Cache::put(key, userId,
// ttl), Cache::get(key), Cache::forget(key), and the per-challenge wrong
// -code attempt counter.

func (l *Limiter) Put(ctx context.Context, key, value string, ttl time.Duration) error {
	if l.rdb != nil {
		return l.rdb.Set(ctx, "kv:"+key, value, ttl).Err()
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	l.values[key] = entry{value: value, expiresAt: time.Now().Add(ttl)}
	return nil
}

func (l *Limiter) Get(ctx context.Context, key string) (string, bool, error) {
	if l.rdb != nil {
		v, err := l.rdb.Get(ctx, "kv:"+key).Result()
		if err == redis.Nil {
			return "", false, nil
		}
		if err != nil {
			return "", false, err
		}
		return v, true, nil
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	e, ok := l.values[key]
	if !ok || time.Now().After(e.expiresAt) {
		return "", false, nil
	}
	return e.value, true, nil
}

func (l *Limiter) Delete(ctx context.Context, key string) error {
	if l.rdb != nil {
		return l.rdb.Del(ctx, "kv:"+key).Err()
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.values, key)
	return nil
}

// Incr returns the post-increment count for key, setting ttl only when the
// counter is first created (matches Cache::get($key,0) + Cache::put pairs
// used for the 2FA wrong-code attempt counter).
func (l *Limiter) Incr(ctx context.Context, key string, ttl time.Duration) (int, error) {
	if l.rdb != nil {
		full := "kv:" + key
		count, err := l.rdb.Incr(ctx, full).Result()
		if err != nil {
			return 0, err
		}
		if count == 1 {
			l.rdb.Expire(ctx, full, ttl)
		}
		return int(count), nil
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	e, ok := l.values[key]
	count := 1
	if ok && time.Now().Before(e.expiresAt) {
		if n, err := strconv.Atoi(e.value); err == nil {
			count = n + 1
		}
	}
	l.values[key] = entry{value: strconv.Itoa(count), expiresAt: time.Now().Add(ttl)}
	return count, nil
}
