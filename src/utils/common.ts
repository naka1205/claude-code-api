/**
 * Common utility functions
 */

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `req_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Convert Headers object to plain object
 */
export function headersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

/**
 * Mask API key for logging
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 12) {
    return '***';
  }
  return apiKey.substring(0, 11) + '***';
}

/**
 * Get error type based on HTTP status code
 */
export function getErrorTypeFromStatus(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return 'invalid_request_error';
    case 401:
      return 'authentication_error';
    case 403:
      return 'permission_error';
    case 404:
      return 'not_found_error';
    case 429:
      return 'rate_limit_error';
    case 502:
    case 503:
      return 'overloaded_error';
    case 504:
      return 'timeout_error';
    default:
      return 'api_error';
  }
}