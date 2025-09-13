/**
 * 通用类型定义
 * 包含错误处理、验证、配置和测试相关的类型定义
 */

// 错误代码枚举
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  TRANSFORMATION_ERROR = 'TRANSFORMATION_ERROR',
  API_ERROR = 'API_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  INVALID_REQUEST = 'INVALID_REQUEST'
}

// 验证错误接口
export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: any;
}

// API错误接口
export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: any;
  statusCode: number;
  timestamp?: string;
}

// Claude错误响应格式
export interface ClaudeErrorResponse {
  type: 'error';
  error: {
    type: string;
    message: string;
    details?: any;
  };
}

// 服务器配置接口
export interface ServerConfig {
  port: number;
  host: string;
  timeout?: number;
  maxRequestSize?: number;
}

// Gemini API配置
export interface GeminiConfig {
  baseUrl: string;
  apiVersion: string;
  timeout: number;
}

// 日志配置
export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  enableConsole: boolean;
  enableFile?: boolean;
  logFile?: string;
}

// 主配置接口
export interface Config {
  server: ServerConfig;
  gemini: GeminiConfig;
  logging: LoggingConfig;
  apiKey?: string;
  enableCors?: boolean;
  enableRequestLogging?: boolean;
}

// 测试用例接口
export interface TestCase {
  name: string;
  description?: string;
  input: any;
  expected: any;
  setup?: () => void | Promise<void>;
  teardown?: () => void | Promise<void>;
  timeout?: number;
}

// 测试套件接口
export interface TestSuite {
  name: string;
  description?: string;
  testCases: TestCase[];
  beforeAll?: () => void | Promise<void>;
  afterAll?: () => void | Promise<void>;
  beforeEach?: () => void | Promise<void>;
  afterEach?: () => void | Promise<void>;
}

// 测试结果接口
export interface TestResult {
  name: string;
  passed: boolean;
  error?: Error;
  duration: number;
  skipped?: boolean;
}

// 测试套件结果接口
export interface TestSuiteResult {
  name: string;
  results: TestResult[];
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  duration: number;
}

// HTTP方法枚举
export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH',
  OPTIONS = 'OPTIONS',
  HEAD = 'HEAD'
}

// HTTP状态码枚举
export enum HttpStatusCode {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504
}

// 请求上下文接口
export interface RequestContext {
  requestId: string;
  timestamp: number;
  userAgent?: string;
  clientIp?: string;
  apiKey?: string;
}

// 响应元数据接口
export interface ResponseMetadata {
  requestId: string;
  processingTime: number;
  model: string;
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
}

export interface ModelCapabilities {
  /** 是否支持Extended Thinking功能 */
  supportsThinking: boolean;
  /** 是否支持视觉/图像输入 */
  supportsVision: boolean;
  /** 最大输入token数量 */
  maxInputTokens: number;
  /** 最大输出token数量 */
  maxOutputTokens: number;
  /** 是否支持工具调用 */
  supportsTools: boolean;
  /** 是否支持流式响应 */
  supportsStreaming: boolean;
  /** 模型类别 */
  category: 'pro' | 'flash' | 'lite';
}