/**
 * Configuration management
 */

import type { Env } from './types/common';

export interface Config {
  geminiBaseUrl: string;
  geminiApiVersion: string;
  allowedOrigins: string;
  enableLogging: boolean;
}

/**
 * Get configuration from environment
 */
export function getConfig(env: Env): Config {
  return {
    geminiBaseUrl: env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
    geminiApiVersion: env.GEMINI_API_VERSION || 'v1beta',
    allowedOrigins: env.ALLOWED_ORIGINS || '*',
    enableLogging: env.ENABLE_LOGGING === 'true',
  };
}
