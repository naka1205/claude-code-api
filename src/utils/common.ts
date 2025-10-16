/**
 * Common utility functions
 */

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
 * Mask sensitive data in objects for logging
 */
export function maskSensitiveData(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const sensitiveKeys = ['key', 'apikey', 'api_key', 'password', 'token', 'secret', 'authorization'];
  const masked = { ...obj };

  for (const key in masked) {
    if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
      if (typeof masked[key] === 'string') {
        masked[key] = maskApiKey(masked[key]);
      }
    }
  }

  return masked;
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

/**
 * Enhanced error context for better debugging
 */
export interface ErrorContext {
  requestId?: string;
  timestamp: string;
  component: string;
  operation: string;
  statusCode?: number;
  originalError?: any;
  stack?: string;
  additionalData?: Record<string, any>;
}

/**
 * Create standardized error context
 */
export function createErrorContext(
  component: string,
  operation: string,
  error: any,
  additionalData?: Record<string, any>
): ErrorContext {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  return {
    timestamp: new Date().toISOString(),
    component,
    operation,
    originalError: {
      message: errorMessage,
      name: error instanceof Error ? error.name : 'UnknownError',
      ...error
    },
    stack: errorStack,
    additionalData
  };
}

