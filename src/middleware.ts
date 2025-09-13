/**
 * 中间件系统 - Cloudflare Workers版本
 * 简化的中间件处理链
 */

export interface Middleware {
  name: string;
  execute(request: Request, context: any): Promise<Request | Response | void>;
}

export class MiddlewareStack {
  private middlewares: Middleware[] = [];

  /**
   * 添加中间件
   */
  add(middleware: Middleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * 执行中间件栈
   */
  async execute(request: Request, context: any): Promise<Request | Response> {
    let currentRequest = request;

    for (const middleware of this.middlewares) {
      try {
        const result = await middleware.execute(currentRequest, context);

        // 如果返回Response，直接返回（短路）
        if (result instanceof Response) {
          return result;
        }

        // 如果返回Request，使用新的request继续
        if (result instanceof Request) {
          currentRequest = result;
        }

        // 如果返回void，继续下一个中间件
      } catch (error) {
        console.error(`Middleware ${middleware.name} error:`, error);
        throw error;
      }
    }

    return currentRequest;
  }
}

/**
 * 创建默认中间件栈
 */
export function createDefaultMiddlewareStack(): MiddlewareStack {
  const stack = new MiddlewareStack();

  // 添加默认中间件
  stack.add(new LoggingMiddleware());
  stack.add(new ErrorMiddleware());

  return stack;
}

/**
 * 日志中间件
 */
export class LoggingMiddleware implements Middleware {
  name = 'logging';

  async execute(request: Request, context: any): Promise<void> {
    const start = Date.now();
    const url = new URL(request.url);

    console.log(`[${new Date().toISOString()}] ${request.method} ${url.pathname}`);

    // 记录请求完成时间（在context中）
    if (context) {
      context.requestStart = start;
    }
  }
}

/**
 * 错误处理中间件
 */
export class ErrorMiddleware implements Middleware {
  name = 'error';

  async execute(request: Request, context: any): Promise<void> {
    // 这个中间件主要是设置错误处理上下文
    // 实际错误处理在主处理器中
    if (context) {
      context.errorHandler = (error: Error) => {
        console.error('Request error:', error);
      };
    }
  }
}