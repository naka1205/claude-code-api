/**
 * Error response utilities
 */

import { ClaudeErrorResponse } from '../types/claude';
import { createResponseHeaders } from './cors';
import { getErrorTypeFromStatus } from './common';

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  statusCode: number,
  message: string,
  corsEnabled: boolean = true
): Response {
  const errorResponse: ClaudeErrorResponse = {
    type: 'error',
    error: {
      type: getErrorTypeFromStatus(statusCode),
      message: message
    }
  };

  const headers = corsEnabled
    ? createResponseHeaders('application/json')
    : new Headers({
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      });

  return new Response(JSON.stringify(errorResponse), {
    status: statusCode,
    headers
  });
}

