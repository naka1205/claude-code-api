/**
 * 配置管理模块 - Cloudflare Workers版本
 * 支持环境变量和硬编码配置
 */

import { TIMEOUTS, RATE_LIMITS, SERVER_DEFAULTS } from './utils/constants';

/**
 * 服务器配置接口
 */
export interface ServerConfig {
  port: number;
  host: string;
  corsEnabled: boolean;
  timeout: number;
  enableValidation: boolean;
}

/**
 * Gemini API配置接口
 */
export interface GeminiConfig {
  baseUrl: string;
  apiVersion: string;
  timeout: number;
}

/**
 * 速率限制配置接口
 */
export interface RateLimitItem {
  rpm: number;
  rpd: number;
}

export interface RateLimitConfig {
  tiers: Record<'gemini-3.1-pro-preview' | 'gemini-3-flash-preview' | 'gemini-3.1-flash-lite-preview', RateLimitItem>;
}

/**
 * 黑名单冷却配置
 */
export interface BlacklistConfig {
  cooldownMinMs: number;
  cooldownMaxMs: number;
}

/**
 * 完整配置接口
 */
export interface Config {
  server: ServerConfig;
  gemini: GeminiConfig;
  rateLimits: RateLimitConfig;
  blacklist: BlacklistConfig;
  kv?: KVNamespace;
}

/**
 * 配置验证错误
 */
export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(`Configuration validation error: ${message}`);
    this.name = 'ConfigValidationError';
  }
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Config = {
  server: {
    port: SERVER_DEFAULTS.PORT,
    host: SERVER_DEFAULTS.HOST,
    corsEnabled: true,
    timeout: TIMEOUTS.STREAM,
    enableValidation: true
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com',
    apiVersion: 'v1beta',
    timeout: TIMEOUTS.STREAM
  },
  rateLimits: {
    tiers: {
      'gemini-3.1-pro-preview': { rpm: 5, rpd: 100 },
      'gemini-3-flash-preview': { rpm: 10, rpd: 250 },
      'gemini-3.1-flash-lite-preview': { rpm: 15, rpd: 1000 }
    }
  },
  blacklist: {
    cooldownMinMs: RATE_LIMITS.COOLDOWN_MIN_MS,
    cooldownMaxMs: RATE_LIMITS.COOLDOWN_MAX_MS
  }
};

/**
 * 从环境变量加载配置
 */
export function loadConfig(env?: any): Config {
  const config = { ...DEFAULT_CONFIG };

  if (env) {
    // KV 绑定
    if (env.KV) config.kv = env.KV;
    // Server configuration
    if (env.PORT) config.server.port = parseInt(env.PORT);
    if (env.HOST) config.server.host = env.HOST;
    if (env.CORS_ENABLED !== undefined) config.server.corsEnabled = env.CORS_ENABLED !== 'false';
    if (env.SERVER_TIMEOUT) config.server.timeout = parseInt(env.SERVER_TIMEOUT);
    if (env.ENABLE_VALIDATION !== undefined) config.server.enableValidation = env.ENABLE_VALIDATION !== 'false';

    // Gemini configuration
    if (env.GEMINI_BASE_URL) config.gemini.baseUrl = env.GEMINI_BASE_URL;
    if (env.GEMINI_API_VERSION) config.gemini.apiVersion = env.GEMINI_API_VERSION;
    if (env.GEMINI_TIMEOUT) config.gemini.timeout = parseInt(env.GEMINI_TIMEOUT);

    // Blacklist configuration
    if (env.BLACKLIST_COOLDOWN_MIN_MS) config.blacklist.cooldownMinMs = parseInt(env.BLACKLIST_COOLDOWN_MIN_MS);
    if (env.BLACKLIST_COOLDOWN_MAX_MS) config.blacklist.cooldownMaxMs = parseInt(env.BLACKLIST_COOLDOWN_MAX_MS);
  }

  return config;
}

