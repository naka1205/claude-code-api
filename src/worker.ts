/**
 * Cloudflare Workers Entry Point
 * Claude to Gemini API Compatibility Layer
 */

import { RequestHandler } from './handler';
import { StreamManager } from './handler/stream-manager';
import { Config } from './config';
import { logger } from './middlewares/logger';

export interface Env {
  KV?: KVNamespace;  // Make KV optional
  // Environment variables can be accessed here
  GEMINI_API_KEYS?: string;
  PORT?: string;
  HOST?: string;
  CORS_ENABLED?: string;
  ENABLE_VALIDATION?: string;
  ENABLE_LOGGING?: string;
}

/**
 * Parse request body safely
 */
async function parseBody(request: Request): Promise<any> {
  try {
    const contentType = request.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return await request.json();
    }
    return await request.text();
  } catch (error) {
    return null;
  }
}

/**
 * Set CORS headers
 */
function setCorsHeaders(): Headers {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, anthropic-version');
  headers.set('Access-Control-Max-Age', '86400');
  return headers;
}

/**
 * Create error response
 */
function createErrorResponse(statusCode: number, message: string, corsEnabled: boolean = true): Response {
  const errorType = getErrorType(statusCode);
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache'
  });

  if (corsEnabled) {
    const corsHeaders = setCorsHeaders();
    corsHeaders.forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return new Response(
    JSON.stringify({
      type: 'error',
      error: {
        type: errorType,
        message: message
      }
    }),
    {
      status: statusCode,
      headers
    }
  );
}

/**
 * Get error type based on status code
 */
function getErrorType(statusCode: number): string {
  switch (statusCode) {
    case 400: return 'invalid_request_error';
    case 401: return 'authentication_error';
    case 403: return 'permission_error';
    case 404: return 'not_found_error';
    case 429: return 'rate_limit_error';
    case 500: return 'api_error';
    default: return 'api_error';
  }
}

/**
 * Main request handler
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      const method = request.method;
      const pathname = url.pathname;

      // 设置请求ID
      const requestId = `req_${Math.random().toString(36).substr(2, 9)}`;
      logger.setRequestId(requestId);

      console.log(`[Worker] ${method} ${pathname} - RequestID: ${requestId}`);
      // Convert URLSearchParams and Headers for Workers environment
      const queryParams: Record<string, string> = {};
      url.searchParams.forEach((value, key) => {
        queryParams[key] = value;
      });

      const headerObj: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        headerObj[key] = value;
      });

      logger.info('Request received', {
        method,
        pathname,
        query: queryParams,
        headers: logger.sanitizeHeaders(headerObj)
      });

      // Get config from environment
      const corsEnabled = env.CORS_ENABLED !== 'false';

      // Handle CORS preflight
      if (method === 'OPTIONS') {
        console.log('[Worker] Handling CORS preflight');
        const headers = setCorsHeaders();
        return new Response(null, { status: 204, headers });
      }

      // Health check endpoint
      if (method === 'GET' && pathname === '/health') {
        const headers = new Headers({ 'Content-Type': 'application/json' });
        if (corsEnabled) {
          const corsHeaders = setCorsHeaders();
          corsHeaders.forEach((value, key) => {
            headers.set(key, value);
          });
        }
        return new Response(
          JSON.stringify({
            status: 'ok',
            timestamp: new Date().toISOString(),
            environment: 'cloudflare-workers'
          }),
          { status: 200, headers }
        );
      }

      // Parse request body
      const body = await parseBody(request);

      // Create request context
      const headers: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        headers[key] = value;
      });

      const context = {
        method,
        url: request.url,
        pathname,
        query: url.searchParams,
        headers,
        body
      };

      // Initialize request handler
      const handler = new RequestHandler({
        enableValidation: env.ENABLE_VALIDATION !== 'false',
        enableLogging: env.ENABLE_LOGGING !== 'false',
        env,
        ctx
      });

      // Claude API compatibility endpoints
      if (method === 'POST' && pathname === '/v1/messages') {
        logger.info('Handling messages endpoint');
        return await handler.handleMessagesRequest(context, request, requestId);
      }

      if (method === 'POST' && pathname === '/v1/messages/count-tokens') {
        logger.info('Handling count-tokens endpoint');
        return await handler.handleCountTokensRequest(context, request, requestId);
      }

      // 404 for unknown endpoints
      logger.warn('Unknown endpoint', { pathname });
      return createErrorResponse(404, 'Not Found', corsEnabled);

    } catch (error) {
      logger.error('Worker error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      console.error('Worker error:', error);
      return createErrorResponse(500, 'Internal Server Error');
    }
  }
};