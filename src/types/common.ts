/**
 * 通用类型定义
 * 包含错误、配置、测试等公共类型
 */

/**
 * API 提供商类型
 */
export type ApiProvider = 'claude' | 'gemini';

/**
 * API 错误类型
 */
export interface ApiError {
  code: string;
  message: string;
  details?: any;
  statusCode?: number;
}

/**
 * 转换错误类
 */
export class TransformationError extends Error {
  public code: string;
  public details?: any;

  constructor(message: string, code: string = 'TRANSFORMATION_ERROR', details?: any) {
    super(message);
    this.name = 'TransformationError';
    this.code = code;
    this.details = details;
  }
}

/**
 * 验证错误类
 */
export class ValidationError extends Error {
  public code: string;
  public field?: string;
  public details?: any;

  constructor(message: string, field?: string, details?: any) {
    super(message);
    this.name = 'ValidationError';
    this.code = 'VALIDATION_ERROR';
    this.field = field;
    this.details = details;
  }
}

/**
 * API 客户端错误类
 */
export class ApiClientError extends Error {
  public statusCode: number;
  public code: string;
  public details?: any;

  constructor(message: string, statusCode: number, code: string = 'API_ERROR', details?: any) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * 流式响应处理器接口
 */
export interface StreamHandler {
  onData(chunk: any): void;
  onError(error: Error): void;
  onComplete(): void;
}

/**
 * 重试配置
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

/**
 * 请求选项
 */
export interface RequestOptions {
  timeout?: number;
  headers?: Record<string, string>;
  retryConfig?: RetryConfig;
}

/**
 * 响应元数据
 */
export interface ResponseMetadata {
  requestId?: string;
  latency?: number;
  retryCount?: number;
  provider: ApiProvider;
  model?: string;
}

/**
 * 转换上下文
 */
export interface TransformContext {
  provider: ApiProvider;
  model?: string;
  stream?: boolean;
  metadata?: Record<string, any>;
}

/**
 * 测试配置
 */
export interface TestConfig {
  provider: ApiProvider;
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  debug?: boolean;
}

/**
 * 测试结果
 */
export interface TestResult {
  success: boolean;
  duration: number;
  error?: Error;
  response?: any;
  metadata?: ResponseMetadata;
}

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
}

/**
 * 缓存配置
 */
export interface CacheConfig {
  enabled: boolean;
  ttl: number;
  maxSize: number;
  strategy: 'lru' | 'fifo' | 'lfu';
}

/**
 * 缓存项
 */
export interface CacheItem<T = any> {
  key: string;
  value: T;
  timestamp: number;
  ttl: number;
  hits: number;
}

/**
 * 日志级别
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * 日志条目
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  error?: Error;
}