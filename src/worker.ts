/**
 * Cloudflare Workers Entry Point
 * Claude to Gemini API Compatibility Layer
 */

import { RequestHandler } from './handler';
import { createCorsHeaders, createResponseHeaders } from './utils/cors';
import { headersToObject } from './utils/common';
import { createErrorResponse } from './utils/response';
import { Logger } from './utils/logger';

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
    const startTime = Date.now();

    try {
      const url = new URL(request.url);
      const method = request.method;
      const pathname = url.pathname;

      // 生成唯一请求ID - 确保每个请求都不同
      const cfRay = request.headers.get('cf-ray');

      let requestId: string;
      if (cfRay) {
        // 生产环境使用CF-Ray
        requestId = cfRay;
      } else {
        // 本地开发环境：确保每个请求都有唯一ID
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, 8);
        const colo = (request as any).cf?.colo || 'dev';

        requestId = `${colo}_${timestamp}_${random}`;
      }

      console.log('Generated unique requestId:', requestId);

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

      // Logs endpoint for debugging
      if (method === 'GET' && pathname === '/logs') {
        const headers = corsEnabled
          ? createResponseHeaders('application/json')
          : new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });

        const logs = Logger.getAllLogs();
        const stats = Logger.getStats();

        return new Response(
          JSON.stringify({
            stats,
            logs,
            timestamp: new Date().toISOString()
          }),
          { status: 200, headers }
        );
      }

      // Get specific log by ID
      if (method === 'GET' && pathname.startsWith('/logs/')) {
        const requestId = pathname.split('/')[2];
        const headers = corsEnabled
          ? createResponseHeaders('application/json')
          : new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });

        const log = Logger.getLog(requestId);
        if (!log) {
          return new Response(
            JSON.stringify({ error: 'Log not found' }),
            { status: 404, headers }
          );
        }

        return new Response(
          JSON.stringify(log),
          { status: 200, headers }
        );
      }

      // Clear logs endpoint
      if (method === 'DELETE' && pathname === '/logs') {
        const headers = corsEnabled
          ? createResponseHeaders('application/json')
          : new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });

        const count = Logger.clear();

        return new Response(
          JSON.stringify({ message: `Cleared ${count} log entries` }),
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


      if (method === 'POST' && pathname === '/v1/messages/count_tokens') {
        const response = await handler.handleCountTokensRequest(context, request, requestId);
        return response;
      }

      // Claude API compatibility endpoints
      if (method === 'POST' && pathname === '/v1/messages') {
        const response = await handler.handleMessagesRequest(context, request, requestId);
        return response;
      }


      // 404 for unknown endpoints
      return createErrorResponse(404, 'Not Found', corsEnabled);

    } catch (error) {
      return createErrorResponse(500, 'Internal Server Error');
    }
  }
};