/**
 * 日志中间件 - Cloudflare Workers版本
 */

import { Middleware } from '../middleware';

export interface LogEntry {
  timestamp: string;
  requestId?: string;
  method: string;
  path: string;
  status?: number;
  duration?: number;
  error?: string;
  userAgent?: string;
  ip?: string;
  // 额外的调试信息
  bodySize?: number;
  responseSize?: number;
  headers?: Record<string, string>;
  geminiEndpoint?: string;
  isStream?: boolean;
  toolsCount?: number;
  [key: string]: any;
}

// 增强的logger单例用于全局日志记录
export const logger = {
  requestId: '',

  setRequestId(id: string) {
    this.requestId = id;
  },

  formatLog(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const logObj = {
      timestamp,
      level,
      requestId: this.requestId,
      message,
      ...data
    };
    return JSON.stringify(logObj);
  },

  info: function(message: string, data?: any) {
    console.log(this.formatLog('INFO', message, data));
  },

  warn: function(message: string, data?: any) {
    console.warn(this.formatLog('WARN', message, data));
  },

  error: function(message: string, data?: any) {
    console.error(this.formatLog('ERROR', message, data));
  },

  debug: function(message: string, data?: any) {
    console.log(this.formatLog('DEBUG', message, data));
  },

  // 专门的日志方法
  request: function(method: string, path: string, headers: any, body?: any) {
    this.info('Request', {
      method,
      path,
      headers: this.sanitizeHeaders(headers),
      bodySize: body ? JSON.stringify(body).length : 0,
      bodyPreview: body ? this.truncate(JSON.stringify(body), 200) : undefined
    });
  },

  validation: function(isValid: boolean, errors?: string[], requestId?: string) {
    if (!isValid && errors) {
      this.warn('Request validation failed', { errors });
    } else {
      this.debug('Request validation passed', {});
    }
  },

  transformation: function(type: 'request' | 'response', fromModel: string, toModel: string, requestId?: string) {
    this.debug(`${type} transformation`, { fromModel, toModel });
  },

  apiCall: function(endpoint: string, method: string, requestId?: string) {
    this.info('API call', { endpoint, method });
  },

  apiResponse: function(endpoint: string, statusCode: number, duration?: number, requestId?: string) {
    this.info('API response', { endpoint, statusCode, duration });
  },

  response: function(status: number, duration: number, body?: any, isStream?: boolean) {
    this.info('Response', {
      status,
      duration,
      isStream,
      bodySize: body && !isStream ? JSON.stringify(body).length : 0
    });
  },

  gemini: function(action: string, endpoint: string, data?: any) {
    this.info(`Gemini ${action}`, {
      endpoint,
      ...data
    });
  },

  stream: function(event: string, data?: any) {
    this.debug(`Stream ${event}`, data);
  },

  tool: function(action: string, toolName: string, data?: any) {
    this.info(`Tool ${action}`, {
      toolName,
      ...data
    });
  },

  transform: function(stage: string, inputSize: number, outputSize: number, warnings?: any[]) {
    this.debug(`Transform ${stage}`, {
      inputSize,
      outputSize,
      warnings: warnings?.length || 0
    });
  },

  // 辅助方法
  sanitizeHeaders: function(headers: any): any {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(headers || {})) {
      if (key.toLowerCase().includes('key') || key.toLowerCase().includes('auth')) {
        sanitized[key] = typeof value === 'string' ? value.substring(0, 10) + '***' : '***';
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  },

  truncate: function(str: string, maxLength: number = 500): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + `... (${str.length - maxLength} more chars)`;
  }
};

export class LoggerMiddleware implements Middleware {
  name = 'logger';
  private enableConsole: boolean;

  constructor(enableConsole: boolean = true) {
    this.enableConsole = enableConsole;
  }

  async execute(request: Request, context: any): Promise<void> {
    const start = Date.now();
    const url = new URL(request.url);
    // RequestID现在由Worker层统一生成和管理，这里仅作为备用
    const requestId = logger.requestId || `req_${Math.random().toString(36).substr(2, 9)}`;

    // 设置全局requestId
    logger.setRequestId(requestId);

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      requestId,
      method: request.method,
      path: url.pathname,
      userAgent: request.headers.get('user-agent') || undefined,
      ip: request.headers.get('cf-connecting-ip') ||
          request.headers.get('x-forwarded-for') ||
          undefined
    };

    // 添加日志上下文
    if (context) {
      context.logEntry = logEntry;
      context.logStart = start;

      // 添加完成日志的函数
      context.logComplete = (status: number, error?: Error) => {
        logEntry.status = status;
        logEntry.duration = Date.now() - start;
        if (error) {
          logEntry.error = error.message;
        }

        if (this.enableConsole) {
          this.logToConsole(logEntry);
        }
      };
    }

    // 立即记录请求开始
    if (this.enableConsole) {
      console.log(`[${logEntry.timestamp}] ${logEntry.method} ${logEntry.path} - Started`);
    }
  }

  private logToConsole(entry: LogEntry): void {
    const level = entry.error ? 'ERROR' : 'INFO';
    const duration = entry.duration ? `${entry.duration}ms` : '';
    const status = entry.status || 0;

    console.log(
      `[${entry.timestamp}] ${level} ${entry.method} ${entry.path} - ${status} ${duration}`
    );

    if (entry.error) {
      console.error(`Error: ${entry.error}`);
    }
  }
}

export function createRequestLogger(requestId: string) {
  return {
    info(message: string, data?: any) {
      logger.info(message, data);
    },
    warn(message: string, data?: any) {
      logger.warn(message, data);
    },
    debug(message: string, data?: any) {
      logger.debug(message, data);
    },
    error(message: string, error?: any, data?: any) {
      logger.error(message, { ...data, error });
    }
  };
}