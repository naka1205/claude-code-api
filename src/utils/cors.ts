/**
 * CORS (Cross-Origin Resource Sharing) utilities
 */

import { CORS_HEADERS } from './constants';

/**
 * Create CORS headers
 */
export function createCorsHeaders(origin?: string): HeadersInit {
  return {
    [CORS_HEADERS.ALLOW_ORIGIN]: origin || '*',
    [CORS_HEADERS.ALLOW_METHODS]: 'GET, POST, OPTIONS',
    [CORS_HEADERS.ALLOW_HEADERS]: 'Content-Type, Authorization, x-api-key, anthropic-version, anthropic-beta',
    [CORS_HEADERS.MAX_AGE]: '86400',
  };
}

/**
 * Handle CORS preflight request
 */
export function handleCorsPreflightRequest(origin?: string): Response {
  return new Response(null, {
    headers: createCorsHeaders(origin),
  });
}

/**
 * Check if origin is allowed
 */
export function isOriginAllowed(origin: string, allowedOrigins: string): boolean {
  if (allowedOrigins === '*') {
    return true;
  }

  const allowedList = allowedOrigins.split(',').map((o) => o.trim());
  return allowedList.includes(origin);
}
