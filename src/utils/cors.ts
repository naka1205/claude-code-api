/**
 * CORS utilities for Cloudflare Workers
 */

/**
 * Create CORS headers for API responses
 */
export function createCorsHeaders(): Headers {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, anthropic-version');
  headers.set('Access-Control-Max-Age', '86400');
  return headers;
}

/**
 * Add CORS headers to existing headers
 */
export function addCorsHeaders(headers: Headers): Headers {
  const corsHeaders = createCorsHeaders();
  corsHeaders.forEach((value, key) => {
    headers.set(key, value);
  });
  return headers;
}

/**
 * Create headers object with CORS and default headers
 */
export function createResponseHeaders(contentType: string = 'application/json'): Headers {
  const headers = new Headers({
    'Content-Type': contentType,
    'Cache-Control': 'no-cache'
  });
  return addCorsHeaders(headers);
}