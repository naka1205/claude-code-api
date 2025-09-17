/**
 * Cloudflare Workers Entry Point
 * Claude to Gemini API Compatibility Layer
 */

import { RequestHandler } from './handler';
import { createCorsHeaders, createResponseHeaders } from './utils/cors';
import { generateRequestId, headersToObject } from './utils/common';
import { createErrorResponse } from './utils/response';

export interface Env {
  KV?: KVNamespace;  // Make KV optional
  // Environment variables can be accessed here
  GEMINI_API_KEYS?: string;
  PORT?: string;
  HOST?: string;
  CORS_ENABLED?: string;
  ENABLE_VALIDATION?: string;
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
 * Main request handler
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      const method = request.method;
      const pathname = url.pathname;

      const requestId = generateRequestId();
      // Convert URLSearchParams and Headers for Workers environment
      const queryParams: Record<string, string> = {};
      url.searchParams.forEach((value, key) => {
        queryParams[key] = value;
      });

      const headerObj = headersToObject(request.headers);

      

      // Get config from environment
      const corsEnabled = env.CORS_ENABLED !== 'false';

      // Handle CORS preflight
      if (method === 'OPTIONS') {
        const headers = createCorsHeaders();
        return new Response(null, { status: 204, headers });
      }

      // Health check endpoint
      if (method === 'GET' && pathname === '/health') {
        const headers = corsEnabled
          ? createResponseHeaders('application/json')
          : new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });

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
      const context = {
        method,
        url: request.url,
        pathname,
        query: url.searchParams,
        headers: headerObj,
        body
      };

      // Initialize request handler
      const handler = new RequestHandler({
        enableValidation: env.ENABLE_VALIDATION !== 'false',
        env,
        ctx
      });

      // Claude API compatibility endpoints
      if (method === 'POST' && pathname === '/v1/messages') {
        return await handler.handleMessagesRequest(context, request, requestId);
      }

      if (method === 'POST' && pathname === '/v1/messages/count-tokens') {
        return await handler.handleCountTokensRequest(context, request, requestId);
      }

      // 404 for unknown endpoints
      
      return createErrorResponse(404, 'Not Found', corsEnabled);

    } catch (error) {
      
      return createErrorResponse(500, 'Internal Server Error');
    }
  }
};