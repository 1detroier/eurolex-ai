import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Rate limit config — read from env with sensible defaults
const RATE_LIMIT_MAX =
  parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10) || 100;
const RATE_LIMIT_WINDOW_SECONDS =
  parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS ?? '3600', 10) || 3600;

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self' https://router.huggingface.co https://api-inference.huggingface.co https://api.cerebras.ai https://api.groq.com https://*.supabase.co",
  ].join('; '),
} as const;

export function middleware(_request: NextRequest) {
  const response = NextResponse.next();

  // ── Rate limit headers (informative — no enforcement in MVP) ──
  // Without KV we can't track per-client counts; signal limit-1 as a
  // reasonable "you're probably fine" indicator.
  response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT_MAX));
  response.headers.set(
    'X-RateLimit-Remaining',
    String(Math.max(RATE_LIMIT_MAX - 1, 0)),
  );
  response.headers.set(
    'X-RateLimit-Reset',
    String(Math.floor(Date.now() / 1000) + RATE_LIMIT_WINDOW_SECONDS),
  );

  // ── Security headers ──
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    // Exclude static assets, images, and favicon from middleware
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
