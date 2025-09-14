/**
 * 错误处理中间件 - Cloudflare Workers版本
 * 增强版：包含重试机制和详细诊断
 */

import { Middleware } from '../middleware';

export interface ErrorDiagnostics {
  statusCode: number;
  error?: any;
  message: string;
  details?: any[];
  requestId?: string;
}

/**
 * 自定义错误类型
 */
export class ValidationError extends Error {
  constructor(message: string, public diagnostics?: ErrorDiagnostics) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string, public diagnostics?: ErrorDiagnostics) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends Error {
  constructor(message: string, public diagnostics?: ErrorDiagnostics) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class ServiceError extends Error {
  constructor(message: string, public diagnostics?: ErrorDiagnostics) {
    super(message);
    this.name = 'ServiceError';
  }
}

export class NetworkError extends Error {
  constructor(message: string, public diagnostics?: ErrorDiagnostics) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends Error {
  constructor(message: string, public diagnostics?: ErrorDiagnostics) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * 错误处理工具类
 */
export class ErrorHandler {
  /**
   * 处理Gemini API错误 - 恢复自Node.js版本
   */
  static handleGeminiError(response: any, requestId?: string): Error {
    const statusCode = response.statusCode || response.status || 500;
    const body = response.body || {};

    // 详细的错误诊断
    const diagnostics: ErrorDiagnostics = {
      statusCode,
      error: body.error || {},
      message: body.error?.message || body.message || 'Unknown error',
      details: body.error?.details || [],
      requestId
    };

    // 根据状态码返回不同的错误类型
    switch (statusCode) {
      case 400:
        return new ValidationError(`Bad Request: ${diagnostics.message}`, diagnostics);
      case 401:
        return new AuthenticationError(`Unauthorized: ${diagnostics.message}`, diagnostics);
      case 403:
        return new AuthenticationError(`Forbidden: ${diagnostics.message}`, diagnostics);
      case 429:
        return new RateLimitError(`Rate Limited: ${diagnostics.message}`, diagnostics);
      case 500:
      case 502:
      case 503:
        return new ServiceError(`Service Error: ${diagnostics.message}`, diagnostics);
      case 504:
        return new TimeoutError(`Gateway Timeout: ${diagnostics.message}`, diagnostics);
      default:
        return new Error(`API Error (${statusCode}): ${diagnostics.message}`);
    }
  }

  /**
   * 直接执行操作，不进行重试
   * 重试应该由客户端实现
   */
  static async execute<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      // 直接抛出错误，不进行重试
      throw error;
    }
  }

  /**
   * 带超时的异步操作执行
   */
  static async withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
    errorMessage: string = 'Operation timed out'
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new TimeoutError(errorMessage));
      }, timeoutMs);
    });

    return Promise.race([operation, timeoutPromise]);
  }

  /**
   * 收集错误诊断信息
   */
  static collectErrorDiagnostics(error: Error, context?: any): ErrorDiagnostics {
    const diagnostics: ErrorDiagnostics = {
      statusCode: 500,
      message: error.message,
      error: {
        name: error.name,
        stack: error.stack
      }
    };

    if (context) {
      diagnostics.details = [context];
    }

    if ((error as any).diagnostics) {
      Object.assign(diagnostics, (error as any).diagnostics);
    }

    return diagnostics;
  }
}

export class ErrorHandlerMiddleware implements Middleware {
  name = 'error-handler';

  async execute(request: Request, context: any): Promise<void> {
    // 添加增强的错误处理上下文
    if (context) {
      // 保留原有的handleError方法
      context.handleError = (error: Error, statusCode: number = 500) => {
        // 收集诊断信息
        const diagnostics = ErrorHandler.collectErrorDiagnostics(error, {
          url: request.url,
          method: request.method
        });

        console.error(`[Error] ${error.message}`, diagnostics);

        // 根据错误类型设置状态码
        let status = statusCode;
        let errorType = 'api_error';

        if (error instanceof ValidationError) {
          status = 400;
          errorType = 'invalid_request_error';
        } else if (error instanceof AuthenticationError) {
          status = 401;
          errorType = 'authentication_error';
        } else if (error instanceof RateLimitError) {
          status = 429;
          errorType = 'rate_limit_error';
        } else if (error instanceof ServiceError) {
          status = 503;
          errorType = 'service_unavailable';
        } else if (error instanceof NetworkError) {
          status = 502;
          errorType = 'bad_gateway';
        } else if (error instanceof TimeoutError) {
          status = 504;
          errorType = 'timeout_error';
        }

        return new Response(
          JSON.stringify({
            type: 'error',
            error: {
              type: errorType,
              message: error.message
            }
          }),
          {
            status,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache'
            }
          }
        );
      };

      // 添加ErrorHandler工具类到上下文
      context.ErrorHandler = ErrorHandler;

      // 添加简化的错误转换方法
      context.transformGeminiError = (error: any, requestId?: string) => {
        return ErrorHandler.handleGeminiError(error, requestId);
      };
    }
  }
}