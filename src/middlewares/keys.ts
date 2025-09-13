/**
 * API密钥验证中间件 - Cloudflare Workers版本
 */

import { Middleware } from '../middleware';

export class KeyValidationMiddleware implements Middleware {
  name = 'key-validation';

  async execute(request: Request, context: any): Promise<Response | void> {
    // 跳过不需要验证的路径
    const url = new URL(request.url);
    if (url.pathname === '/health' || request.method === 'OPTIONS') {
      return;
    }

    // 提取API密钥
    const authHeader = request.headers.get('authorization');
    const apiKeyHeader = request.headers.get('x-api-key');

    let apiKey: string | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      apiKey = authHeader.substring(7).trim();
    } else if (apiKeyHeader) {
      apiKey = apiKeyHeader.trim();
    }

    // 验证密钥是否存在
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'API key is required. Please provide it via Authorization header (Bearer token) or x-api-key header.'
          }
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          }
        }
      );
    }

    // 将密钥添加到context供后续使用
    if (context) {
      context.apiKey = apiKey;
    }
  }
}