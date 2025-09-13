/**
 * 配置管理模块 - Cloudflare Workers版本
 * 支持环境变量和硬编码配置
 */

/**
 * 服务器配置接口
 */
export interface ServerConfig {
  port: number;
  host: string;
  corsEnabled: boolean;
  timeout: number;
  enableValidation: boolean;
  enableLogging: boolean;
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
 * 日志配置接口
 */
export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  enableConsole: boolean;
  enableFile: boolean;
  logDir?: string;
}

/**
 * 速率限制配置接口
 */
export interface RateLimitItem {
  rpm: number;
  rpd: number;
}

export interface RateLimitConfig {
  tiers: Record<'gemini-2.5-pro' | 'gemini-2.5-flash' | 'gemini-2.5-flash-lite' | 'gemini-2.0-flash', RateLimitItem>;
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
  logging: LoggingConfig;
  rateLimits: RateLimitConfig;
  blacklist: BlacklistConfig;
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
    port: 3000,
    host: '0.0.0.0',
    corsEnabled: true,
    timeout: 30000,
    enableValidation: true,
    enableLogging: true
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com',
    apiVersion: 'v1beta',
    timeout: 30000
  },
  logging: {
    level: 'info',
    enableConsole: true,
    enableFile: false
  },
  rateLimits: {
    tiers: {
      'gemini-2.5-pro': { rpm: 1000, rpd: 1_000_000 },
      'gemini-2.5-flash': { rpm: 1000, rpd: 1_000_000 },
      'gemini-2.5-flash-lite': { rpm: 1000, rpd: 1_000_000 },
      'gemini-2.0-flash': { rpm: 1000, rpd: 1_000_000 }
    }
  },
  blacklist: {
    cooldownMinMs: 15000,
    cooldownMaxMs: 60000
  }
};

/**
 * 从环境变量加载配置
 */
export function loadConfig(env?: any): Config {
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  if (env) {
    // Server configuration
    if (env.PORT) config.server.port = parseInt(env.PORT);
    if (env.HOST) config.server.host = env.HOST;
    if (env.CORS_ENABLED !== undefined) config.server.corsEnabled = env.CORS_ENABLED !== 'false';
    if (env.SERVER_TIMEOUT) config.server.timeout = parseInt(env.SERVER_TIMEOUT);
    if (env.ENABLE_VALIDATION !== undefined) config.server.enableValidation = env.ENABLE_VALIDATION !== 'false';
    if (env.ENABLE_LOGGING !== undefined) config.server.enableLogging = env.ENABLE_LOGGING !== 'false';

    // Gemini configuration
    if (env.GEMINI_BASE_URL) config.gemini.baseUrl = env.GEMINI_BASE_URL;
    if (env.GEMINI_API_VERSION) config.gemini.apiVersion = env.GEMINI_API_VERSION;
    if (env.GEMINI_TIMEOUT) config.gemini.timeout = parseInt(env.GEMINI_TIMEOUT);

    // Logging configuration
    if (env.LOG_LEVEL) config.logging.level = env.LOG_LEVEL as any;
    if (env.LOG_CONSOLE !== undefined) config.logging.enableConsole = env.LOG_CONSOLE !== 'false';

    // Blacklist configuration
    if (env.BLACKLIST_COOLDOWN_MIN_MS) config.blacklist.cooldownMinMs = parseInt(env.BLACKLIST_COOLDOWN_MIN_MS);
    if (env.BLACKLIST_COOLDOWN_MAX_MS) config.blacklist.cooldownMaxMs = parseInt(env.BLACKLIST_COOLDOWN_MAX_MS);
  }

  return config;
}

/**
 * 获取配置的安全副本（隐藏敏感信息）
 */
export function getSafeConfig(config?: Config): any {
  const safeConfig = config || DEFAULT_CONFIG;
  return JSON.parse(JSON.stringify(safeConfig));
}

/**
 * 检查必需的配置项
 */
export function checkRequiredConfig(env?: any): string[] {
  // Workers环境下，API密钥由客户端提供，不需要服务端配置
  return [];
}