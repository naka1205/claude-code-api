/**
 * Cloudflare Worker entry point
 * Handles HTTP requests and routes them to appropriate handlers
 */

import type { Env } from './types/common';
import { extractApiKey, parseApiKeys } from './utils/common';
import { logger } from './utils/logger';
import {
  createUnauthorizedResponse,
  createNotFoundResponse,
  createInternalErrorResponse,
} from './utils/response';
import { handleCorsPreflightRequest } from './utils/cors';
import { requestHandler } from './handler';
import { ENDPOINTS, HTTP_METHODS } from './utils/constants';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    try {
      // Handle CORS preflight
      if (request.method === HTTP_METHODS.OPTIONS) {
        logger.debug('Handling CORS preflight request');
        return handleCorsPreflightRequest();
      }

      // Handle health check (no auth required)
      if (url.pathname === ENDPOINTS.HEALTH && request.method === HTTP_METHODS.GET) {
        return requestHandler.handleHealth();
      }

      // Handle logs endpoint (no auth required for easier debugging)
      if (url.pathname === ENDPOINTS.LOGS && request.method === HTTP_METHODS.GET) {
        return requestHandler.handleLogs(request);
      }

      // Handle logs by requestId endpoint
      if (url.pathname.startsWith(ENDPOINTS.LOGS + '/') && request.method === HTTP_METHODS.GET) {
        return requestHandler.handleLogById(request);
      }

      // Extract and validate API key
      const apiKeyString = extractApiKey(request);
      if (!apiKeyString) {
        logger.warn('Missing API key in request');
        return createUnauthorizedResponse();
      }

      // Parse API keys (supports comma-separated multiple keys)
      const apiKeys = parseApiKeys(apiKeyString);
      logger.info('Request received', {
        path: url.pathname,
        method: request.method,
        keyCount: apiKeys.length,
      });

      // Route to appropriate handler
      if (url.pathname === ENDPOINTS.MESSAGES && request.method === HTTP_METHODS.POST) {
        return await requestHandler.handleMessages(request, apiKeys, env);
      }

      if (url.pathname === ENDPOINTS.COUNT_TOKENS && request.method === HTTP_METHODS.POST) {
        return await requestHandler.handleCountTokens(request, apiKeys, env);
      }

      // Route not found
      logger.warn('Route not found', { path: url.pathname, method: request.method });
      return createNotFoundResponse();
    } catch (error) {
      logger.error('Unhandled error in worker', error);
      return createInternalErrorResponse((error as Error).message);
    }
  },
};
