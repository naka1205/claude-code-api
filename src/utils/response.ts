/**
 * HTTP Response utilities
 */

import { HTTP_STATUS, CONTENT_TYPES } from './constants';
import { createCorsHeaders } from './cors';

/**
 * Create JSON response
 */
export function createJsonResponse(
  data: any,
  status: number = HTTP_STATUS.OK,
  additionalHeaders: HeadersInit = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': CONTENT_TYPES.JSON,
      ...createCorsHeaders(),
      ...additionalHeaders,
    },
  });
}

/**
 * Create error response in Claude API format
 */
export function createErrorResponse(
  type: string,
  message: string,
  status: number = HTTP_STATUS.BAD_REQUEST
): Response {
  return createJsonResponse(
    {
      type: 'error',
      error: {
        type,
        message,
      },
    },
    status
  );
}

/**
 * Create SSE response
 */
export function createSSEResponse(): Response {
  const { readable, writable } = new TransformStream();

  return new Response(readable, {
    headers: {
      'Content-Type': CONTENT_TYPES.SSE,
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      ...createCorsHeaders(),
    },
  });
}

/**
 * Create success response with data
 */
export function createSuccessResponse(data: any): Response {
  return createJsonResponse(data, HTTP_STATUS.OK);
}

/**
 * Create not found response
 */
export function createNotFoundResponse(message: string = 'Endpoint not found'): Response {
  return createErrorResponse('not_found_error', message, HTTP_STATUS.NOT_FOUND);
}

/**
 * Create unauthorized response
 */
export function createUnauthorizedResponse(message: string = 'Missing API key'): Response {
  return createErrorResponse('authentication_error', message, HTTP_STATUS.UNAUTHORIZED);
}

/**
 * Create internal error response
 */
export function createInternalErrorResponse(message: string = 'Internal server error'): Response {
  return createErrorResponse('internal_error', message, HTTP_STATUS.INTERNAL_ERROR);
}
