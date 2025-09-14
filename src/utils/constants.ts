/**
 * Application constants
 */

// Timeouts
export const TIMEOUTS = {
  DEFAULT: 30000,
  API_CALL: 60000,
  STREAM: 120000
} as const;

// API Key validation
export const API_KEY = {
  MIN_LENGTH: 20,
  HEADER_NAME: 'x-api-key',
  ALT_HEADER_NAME: 'authorization'
} as const;

// Rate limiting
export const RATE_LIMITS = {
  COOLDOWN_MIN_MS: 15000,
  COOLDOWN_MAX_MS: 60000,
  DEFAULT_RPM: 1000,
  DEFAULT_RPD: 1_000_000
} as const;

// Request defaults
export const REQUEST_DEFAULTS = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000
} as const;

// Server defaults
export const SERVER_DEFAULTS = {
  PORT: 3000,
  HOST: '0.0.0.0'
} as const;