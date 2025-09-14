/**
 * 通用类型定义
 * 仅保留实际使用的类型
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