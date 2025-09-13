/**
 * Cloudflare Workers 入口文件
 * 负责 Workers 生命周期、CORS 处理和请求路由
 */

import { RequestHandler, KeyBalancer } from './handler';

export interface Env {
  KV: KVNamespace;
  ALLOWED_ORIGINS?: string;
}

/**
 * 处理 CORS 头
 */
function createCorsHeaders(origin: string | null, env: Env): HeadersInit {
  const allowedOrigins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['*'];

  const allowOrigin = !origin || allowedOrigins.includes('*')
    ? '*'
    : allowedOrigins.includes(origin)
    ? origin
    : allowedOrigins[0] || '*';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Workers 主入口
 */
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const origin = request.headers.get('Origin');
    const corsHeaders = createCorsHeaders(origin, env);

    // 处理 OPTIONS 请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // 验证请求方法
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({
        error: 'Method not allowed',
        message: 'Only POST method is supported'
      }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // 创建请求处理器
    const handler = new RequestHandler(env.KV);

    try {
      // 处理请求
      const response = await handler.handleRequest(request, ctx);

      // 添加 CORS 头到响应
      const newHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newHeaders.set(key, value as string);
      });

      // 定期清理冷却记录（异步）
      ctx.waitUntil(
        new Promise(resolve => {
          setTimeout(() => {
            KeyBalancer.cleanup();
            resolve(undefined);
          }, 300000); // 5分钟清理一次
        })
      );

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });

    } catch (error) {
      console.error('Worker error:', error);

      return new Response(JSON.stringify({
        error: 'Worker error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  }
};