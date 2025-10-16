/**
 * Common utility functions
 */

import { HEADERS } from './constants';

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `req_${timestamp}${randomPart}`;
}

/**
 * Parse API keys from comma-separated string
 */
export function parseApiKeys(keyString: string): string[] {
  return keyString
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

/**
 * Extract API key from request headers
 */
export function extractApiKey(request: Request): string | null {
  // Try x-api-key header first
  const xApiKey = request.headers.get(HEADERS.X_API_KEY);
  if (xApiKey) return xApiKey;

  // Try Authorization header with Bearer token
  const authHeader = request.headers.get(HEADERS.AUTHORIZATION);
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
}

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `msg_${timestamp}${randomPart}`;
}

/**
 * Generate a unique tool ID
 */
export function generateToolId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `toolu_${timestamp}${randomPart}`;
}

/**
 * Generate a random ID without prefix (internal use)
 */
export function generateRandomId(): string {
  return Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);
}
