# Middleware Specification

## Purpose

Edge Middleware that adds informative rate limit response headers. No enforcement in MVP — headers only for future client awareness.

## Requirements

### Requirement: Rate Limit Headers

The Edge Middleware MUST add the following headers to every API response:
- `X-RateLimit-Limit`: maximum requests per window (default: 100)
- `X-RateLimit-Remaining`: remaining requests (default: 100 — no enforcement)
- `X-RateLimit-Reset`: Unix timestamp of window reset (current window end)
- `Retry-After`: seconds until reset (only on 429 responses)

#### Scenario: Normal request

- GIVEN the middleware is active
- WHEN any `/api/*` route is called
- THEN the response includes all four rate limit headers
- AND `X-RateLimit-Remaining` is always 100 (no decrement in MVP)

#### Scenario: Non-API route

- GIVEN the middleware is active
- WHEN a page route (e.g., `/`) is requested
- THEN rate limit headers are NOT added
- AND the response is unmodified

### Requirement: Configurable Limits

Rate limit values MUST be configurable via environment variables with sensible defaults.

**Env vars**: `RATE_LIMIT_MAX` (default: 100), `RATE_LIMIT_WINDOW_SECONDS` (default: 3600)

#### Scenario: Custom rate limit configured

- GIVEN `RATE_LIMIT_MAX=50` and `RATE_LIMIT_WINDOW_SECONDS=900`
- WHEN the middleware processes a request
- THEN `X-RateLimit-Limit` shows 50
- AND `X-RateLimit-Reset` reflects a 15-minute window

### Requirement: Path Exclusion

The middleware SHALL exclude static assets and Next.js internals from rate limit header injection.

#### Scenario: Static asset request

- GIVEN a request to `/_next/static/...` or `/favicon.ico`
- WHEN the middleware evaluates the path
- THEN the request passes through without headers added

## Phase 2 (DEFERRED)

### Requirement: Enforced Rate Limiting (DEFERRED)

Post-MVP: the system MAY use Vercel KV counters to actually enforce limits and return 429 when exceeded.
