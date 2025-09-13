/**
 * 日志中间件 - Cloudflare Workers版本
 */

import { Middleware } from '../middleware';

export interface LogEntry {
  timestamp: string;
  method: string;
  path: string;
  status?: number;
  duration?: number;
  error?: string;
  userAgent?: string;
  ip?: string;
}

export class LoggerMiddleware implements Middleware {
  name = 'logger';
  private enableConsole: boolean;

  constructor(enableConsole: boolean = true) {
    this.enableConsole = enableConsole;
  }

  async execute(request: Request, context: any): Promise<void> {
    const start = Date.now();
    const url = new URL(request.url);

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
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