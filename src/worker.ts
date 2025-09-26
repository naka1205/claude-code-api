/**
 * Cloudflare Workers Entry Point
 * Claude to Gemini API Compatibility Layer
 */

import { RequestHandler } from './handler';
import { createCorsHeaders, createResponseHeaders } from './utils/cors';
import { generateRequestId, headersToObject } from './utils/common';
import { createErrorResponse } from './utils/response';
import { Logger } from './utils/logger';
import { DataSaver } from './utils/data-saver';

export interface Env {
  KV?: KVNamespace;  // Make KV optional
  // Environment variables can be accessed here
  GEMINI_API_KEYS?: string;
  PORT?: string;
  HOST?: string;
  CORS_ENABLED?: string;
  ENABLE_VALIDATION?: string;
}

/**
 * Parse request body safely
 */
async function parseBody(request: Request): Promise<any> {
  try {
    const contentType = request.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return await request.json();
    }
    return await request.text();
  } catch (error) {
    return null;
  }
}




/**
 * Main request handler
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startTime = Date.now();

    try {
      const url = new URL(request.url);
      const method = request.method;
      const pathname = url.pathname;

      const requestId = generateRequestId();

      // Convert URLSearchParams and Headers for Workers environment
      const queryParams: Record<string, string> = {};
      url.searchParams.forEach((value, key) => {
        queryParams[key] = value;
      });

      const headerObj = headersToObject(request.headers);

      // 记录请求信息
      Logger.info('Worker', `Incoming request: ${method} ${pathname}`, {
        requestId,
        headers: headerObj,
        queryParams
      });

      

      // Get config from environment
      const corsEnabled = env.CORS_ENABLED !== 'false';

      // Handle CORS preflight
      if (method === 'OPTIONS') {
        const headers = createCorsHeaders();
        return new Response(null, { status: 204, headers });
      }

      // 日志端点 - 获取所有日志
      if (method === 'GET' && pathname === '/logs') {
        const headers = corsEnabled
          ? createResponseHeaders('text/plain')
          : new Headers({ 'Content-Type': 'text/plain', 'Cache-Control': 'no-cache' });

        const logs = Logger.getLogsAsText();
        Logger.info('Worker', `Returning ${Logger.getLogs().length} log entries`);

        return new Response(logs || 'No logs available', {
          status: 200,
          headers
        });
      }

      // 日志端点 - 清空日志
      if (method === 'DELETE' && pathname === '/logs') {
        Logger.clear();
        const headers = corsEnabled
          ? createResponseHeaders('application/json')
          : new Headers({ 'Content-Type': 'application/json' });

        return new Response(
          JSON.stringify({ message: 'Logs cleared' }),
          { status: 200, headers }
        );
      }

      // 数据查看端点
      if (method === 'GET' && pathname === '/debug/data') {
        const requestIdParam = url.searchParams.get('requestId');

        if (requestIdParam) {
          // 获取特定请求的数据
          const requestData = DataSaver.getRequestData(requestIdParam);
          const headers = corsEnabled
            ? createResponseHeaders('application/json')
            : new Headers({ 'Content-Type': 'application/json' });

          return new Response(
            JSON.stringify(requestData || { error: 'Request not found' }, null, 2),
            { status: requestData ? 200 : 404, headers }
          );
        } else {
          // 获取所有数据概览
          const allData = DataSaver.getAllData();
          const summary = Array.from(allData.entries()).map(([id, data]) => ({
            requestId: id,
            hasClaudeRequest: !!data.claude?.request,
            hasClaudeResponse: !!data.claude?.response,
            hasGeminiRequest: !!data.gemini?.request,
            hasGeminiResponse: !!data.gemini?.response,
            claudeModel: data.claude?.request?.model || data.claude?.response?.model,
            timestamp: data.claude?.request?.timestamp || data.gemini?.request?.timestamp
          }));

          const headers = corsEnabled
            ? createResponseHeaders('application/json')
            : new Headers({ 'Content-Type': 'application/json' });

          return new Response(
            JSON.stringify({
              total: allData.size,
              requests: summary
            }, null, 2),
            { status: 200, headers }
          );
        }
      }

      // Debug文件端点
      if (method === 'GET' && pathname === '/debug/files') {
        const debugFiles = DataSaver.getDebugFiles();
        const fileList = Array.from(debugFiles.entries()).map(([filename, content]) => ({
          filename,
          timestamp: content.timestamp,
          type: content.type,
          size: content.data.length
        }));

        const headers = corsEnabled
          ? createResponseHeaders('application/json')
          : new Headers({ 'Content-Type': 'application/json' });

        return new Response(
          JSON.stringify({
            total: debugFiles.size,
            files: fileList
          }, null, 2),
          { status: 200, headers }
        );
      }

      // Health check endpoint
      if (method === 'GET' && pathname === '/health') {
        const headers = corsEnabled
          ? createResponseHeaders('application/json')
          : new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });

        return new Response(
          JSON.stringify({
            status: 'ok',
            timestamp: new Date().toISOString(),
            environment: 'cloudflare-workers'
          }),
          { status: 200, headers }
        );
      }

      // Parse request body
      const body = await parseBody(request);

      // Create request context
      const context = {
        method,
        url: request.url,
        pathname,
        query: url.searchParams,
        headers: headerObj,
        body
      };

      // Initialize request handler
      const handler = new RequestHandler({
        enableValidation: env.ENABLE_VALIDATION !== 'false',
        env,
        ctx
      });

      // Claude API compatibility endpoints
      if (method === 'POST' && pathname === '/v1/messages') {
        Logger.info('Worker', 'Handling messages request', { requestId });

        // 保存客户端原始请求数据
        DataSaver.saveClaudeRequest(requestId, {
          method,
          url: request.url,
          headers: headerObj,
          body: body,
          model: body?.model
        });

        const response = await handler.handleMessagesRequest(context, request, requestId);

        // 保存客户端响应数据
        const responseBody = await response.clone().text();
        let parsedResponseBody;
        try {
          parsedResponseBody = JSON.parse(responseBody);
        } catch {
          parsedResponseBody = responseBody;
        }

        DataSaver.saveClaudeResponse(requestId, {
          statusCode: response.status,
          headers: headersToObject(response.headers),
          body: parsedResponseBody,
          isStream: body?.stream || false,
          model: body?.model,
          duration: Date.now() - startTime
        });

        Logger.info('Worker', 'Messages request completed', {
          requestId,
          status: response.status
        });
        return response;
      }

      if (method === 'POST' && pathname === '/v1/messages/count-tokens') {
        Logger.info('Worker', 'Handling count tokens request', { requestId });

        // 保存客户端原始请求数据
        DataSaver.saveClaudeRequest(requestId, {
          method,
          url: request.url,
          headers: headerObj,
          body: body,
          model: body?.model
        });

        const response = await handler.handleCountTokensRequest(context, request, requestId);

        // 保存客户端响应数据
        const responseBody = await response.clone().text();
        let parsedResponseBody;
        try {
          parsedResponseBody = JSON.parse(responseBody);
        } catch {
          parsedResponseBody = responseBody;
        }

        DataSaver.saveClaudeResponse(requestId, {
          statusCode: response.status,
          headers: headersToObject(response.headers),
          body: parsedResponseBody,
          isStream: false,
          model: body?.model,
          duration: Date.now() - startTime
        });

        return response;
      }

      // 404 for unknown endpoints
      Logger.warn('Worker', `Unknown endpoint: ${method} ${pathname}`);
      return createErrorResponse(404, 'Not Found', corsEnabled);

    } catch (error) {
      Logger.error('Worker', 'Unhandled error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      return createErrorResponse(500, 'Internal Server Error');
    }
  }
};