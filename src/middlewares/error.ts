/**
 * 错误处理中间件 - Cloudflare Workers版本
 */

import { Middleware } from '../middleware';

export class ErrorHandlerMiddleware implements Middleware {
  name = 'error-handler';

  async execute(request: Request, context: any): Promise<void> {
    // 添加错误处理上下文
    if (context) {
      context.handleError = (error: Error, statusCode: number = 500) => {
        console.error(`[Error] ${error.message}`, {
          url: request.url,
          method: request.method,
          stack: error.stack
        });

        return new Response(
          JSON.stringify({
            type: 'error',
            error: {
              type: 'api_error',
              message: error.message
            }
          }),
          {
            status: statusCode,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache'
            }
          }
        );
      };
    }
  }
}