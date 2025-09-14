/**
 * 中间件兼容性存根
 * 仅保留向后兼容的最小实现
 */

// 导出兼容旧版本的类（已废弃）
export class Middleware {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
  async execute(request: Request, context: any): Promise<Request | Response | void> {}
}

export class MiddlewareStack {
  add(middleware: Middleware): void {}
  async execute(request: Request, context: any): Promise<Request | Response> {
    return request;
  }
}

export function createDefaultMiddlewareStack(): MiddlewareStack {
  return new MiddlewareStack();
}

export class LoggingMiddleware extends Middleware {
  constructor() {
    super('logging');
  }
}

export class ErrorMiddleware extends Middleware {
  constructor() {
    super('error');
  }
}