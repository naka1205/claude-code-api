/**
 * 配置管理模块
 * 硬编码配置，简化管理
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
 * 速率限制配置接口（硬编码，不使用环境变量）
 */
export interface RateLimitItem {
  rpm: number;
  rpd: number;
}

export interface RateLimitConfig {
  tiers: Record<'gemini-2.5-pro' | 'gemini-2.5-flash' | 'gemini-2.5-flash-lite' | 'gemini-2.0-flash', RateLimitItem>;
}

/**
 * 黑名单冷却配置（当出现429/403时触发）
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
 * 硬编码配置
 */
const CONFIG: Config = {
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
    // 默认放宽，具体配额由上游真实限制；如需收紧请在此修改
    tiers: {
      'gemini-2.5-pro': { rpm: 1000, rpd: 1_000_000 },
      'gemini-2.5-flash': { rpm: 1000, rpd: 1_000_000 },
      'gemini-2.5-flash-lite': { rpm: 1000, rpd: 1_000_000 },
      'gemini-2.0-flash': { rpm: 1000, rpd: 1_000_000 }
    }
  }
  ,
  blacklist: {
    cooldownMinMs: 15000,
    cooldownMaxMs: 60000
  }
};

/**
 * 获取配置
 */
export function loadConfig(): Config {
  return CONFIG;
}

/**
 * 获取配置的安全副本
 */
export function getSafeConfig(): any {
  return JSON.parse(JSON.stringify(CONFIG));
}

/**
 * 检查必需的配置项（服务端不再提供API密钥）
 */
export function checkRequiredConfig(): string[] {
  return [];
}

