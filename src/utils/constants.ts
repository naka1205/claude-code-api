/**
 * System constants and configuration defaults
 */

// API Version
export const ANTHROPIC_VERSION = '2023-06-01';

// API Endpoints
export const ENDPOINTS = {
  MESSAGES: '/v1/messages',
  COUNT_TOKENS: '/v1/messages/count_tokens',
  HEALTH: '/health',
  LOGS: '/logs',
} as const;

// HTTP Methods
export const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  OPTIONS: 'OPTIONS',
} as const;

// Content Types
export const CONTENT_TYPES = {
  JSON: 'application/json',
  SSE: 'text/event-stream',
} as const;

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
} as const;

// Error Types (Claude API)
export const ERROR_TYPES = {
  AUTHENTICATION_ERROR: 'authentication_error',
  INVALID_REQUEST_ERROR: 'invalid_request_error',
  NOT_FOUND_ERROR: 'not_found_error',
  API_ERROR: 'api_error',
  INTERNAL_ERROR: 'internal_error',
} as const;

// SSE Event Types
export const SSE_EVENTS = {
  MESSAGE_START: 'message_start',
  MESSAGE_DELTA: 'message_delta',
  MESSAGE_STOP: 'message_stop',
  CONTENT_BLOCK_START: 'content_block_start',
  CONTENT_BLOCK_DELTA: 'content_block_delta',
  CONTENT_BLOCK_STOP: 'content_block_stop',
  PING: 'ping',
  ERROR: 'error',
} as const;

// Default Configuration
export const DEFAULT_CONFIG = {
  GEMINI_BASE_URL: 'https://generativelanguage.googleapis.com',
  GEMINI_API_VERSION: 'v1beta',
  ALLOWED_ORIGINS: '*',
  ENABLE_LOGGING: true,
  REQUEST_TIMEOUT: 30000, // 30 seconds
} as const;

// Request Limits
export const LIMITS = {
  MAX_MESSAGES: 100000,
  MAX_TOKENS_MIN: 1,
  MAX_TOKENS_DEFAULT: 4096,
  MIN_TEMPERATURE: 0,
  MAX_TEMPERATURE: 1,
  MIN_TOP_P: 0,
  MAX_TOP_P: 1,
  MIN_TOP_K: 0,
} as const;

// Headers
export const HEADERS = {
  X_API_KEY: 'x-api-key',
  AUTHORIZATION: 'authorization',
  CONTENT_TYPE: 'content-type',
  ANTHROPIC_VERSION: 'anthropic-version',
  ANTHROPIC_BETA: 'anthropic-beta',
  X_GOOG_API_KEY: 'x-goog-api-key',
} as const;

// CORS Headers
export const CORS_HEADERS = {
  ALLOW_ORIGIN: 'Access-Control-Allow-Origin',
  ALLOW_METHODS: 'Access-Control-Allow-Methods',
  ALLOW_HEADERS: 'Access-Control-Allow-Headers',
  MAX_AGE: 'Access-Control-Max-Age',
} as const;

// Log Levels
export const LOG_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const;

// Gemini API specific
export const GEMINI_ENDPOINTS = {
  GENERATE_CONTENT: 'generateContent',
  STREAM_GENERATE_CONTENT: 'streamGenerateContent',
  COUNT_TOKENS: 'countTokens',
} as const;
