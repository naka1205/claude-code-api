/**
 * 响应管理器 - Cloudflare Workers版本
 * 处理响应的创建和转换
 */

import { ApiResponse } from '../client';
import { ResponseTransformer } from '../transformers/response-transformer';
import { ClaudeResponse, ClaudeErrorResponse } from '../types/claude';

export class ResponseManager {
  /**
   * 创建错误响应
   */
  createErrorResponse(statusCode: number, message: string): Response {
    const errorResponse: ClaudeErrorResponse = {
      type: 'error',
      error: {
        type: this.getErrorType(statusCode),
        message: message
      }
    };

    return new Response(JSON.stringify(errorResponse), {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version'
      }
    });
  }

  /**
   * 处理Gemini响应
   */
  async handleGeminiResponse(
    response: ApiResponse,
    claudeModel: string,
    exposeThinkingToClient: boolean = false
  ): Promise<Response> {
    try {
      // 检查错误响应
      if (response.statusCode >= 400) {
        return this.handleGeminiError(response);
      }

      // 转换成功响应
      const claudeResponse = await ResponseTransformer.transformResponse(
        response.body,
        claudeModel,
        exposeThinkingToClient
      );

      return new Response(JSON.stringify(claudeResponse), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version'
        }
      });

    } catch (error) {
      console.error('Response handling error:', error);
      return this.createErrorResponse(
        500,
        error instanceof Error ? error.message : 'Failed to process response'
      );
    }
  }

  /**
   * 处理Gemini错误响应
   */
  private handleGeminiError(response: ApiResponse): Response {
    const body = response.body || {};
    const statusCode = response.statusCode;

    // 提取详细错误信息
    let errorMessage = this.extractErrorMessage(body);
    let errorType = this.getErrorType(statusCode);

    // 处理特定的Gemini错误
    if (body?.error) {
      const geminiError = body.error;

      // 处理具体的错误类型
      if (geminiError.code === 'RESOURCE_EXHAUSTED') {
        errorType = 'rate_limit_error';
        errorMessage = 'API rate limit exceeded. Please retry after some time.';
      } else if (geminiError.code === 'INVALID_ARGUMENT') {
        errorType = 'invalid_request_error';
        errorMessage = geminiError.message || 'Invalid request parameters';
      } else if (geminiError.code === 'PERMISSION_DENIED') {
        errorType = 'authentication_error';
        errorMessage = 'Invalid API key or insufficient permissions';
      } else if (geminiError.status === 'UNAVAILABLE' || statusCode === 503) {
        errorType = 'overloaded_error';
        errorMessage = 'The model is currently overloaded. Please try again in a moment.';
      }

      // 添加更多详细信息
      if (geminiError.details && Array.isArray(geminiError.details)) {
        const details = geminiError.details.map((d: any) =>
          typeof d === 'string' ? d : JSON.stringify(d)
        ).join('; ');
        if (details) {
          errorMessage += ` Details: ${details}`;
        }
      }
    }

    // 创建符合Claude格式的错误响应
    const claudeError: any = {
      type: 'error',
      error: {
        type: errorType,
        message: errorMessage
      }
    };

    // 添加可选的调试信息（仅在Workers环境的调试模式）
    // 注意：Workers环境没有process对象，使用环境变量检查
    const debugMode = (globalThis as any).DEBUG === 'true';
    if (debugMode) {
      claudeError.error.details = {
        original_error: body?.error,
        status_code: statusCode
      };
    }

    return new Response(JSON.stringify(claudeError), {
      status: this.mapGeminiStatusToClaude(statusCode),
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version'
      }
    });
  }

  /**
   * 映射Gemini状态码到Claude状态码
   */
  private mapGeminiStatusToClaude(geminiStatus: number): number {
    // 保持大部分状态码不变，仅调整特殊情况
    switch (geminiStatus) {
      case 503: // Service Unavailable
        return 502; // Bad Gateway (表示上游服务问题)
      case 504: // Gateway Timeout
        return 504; // 保持不变
      default:
        return geminiStatus; // 保持原状态码
    }
  }

  /**
   * 提取错误消息
   */
  private extractErrorMessage(body: any): string {
    if (body?.error?.message) {
      return body.error.message;
    }
    if (typeof body === 'string') {
      return body;
    }
    return 'Unknown error occurred';
  }

  /**
   * 获取错误类型
   */
  private getErrorType(statusCode: number): string {
    switch (statusCode) {
      case 400:
        return 'invalid_request_error';
      case 401:
        return 'authentication_error';
      case 403:
        return 'permission_error';
      case 404:
        return 'not_found_error';
      case 429:
        return 'rate_limit_error';
      case 502:
      case 503:
        return 'overloaded_error';
      case 504:
        return 'timeout_error';
      default:
        return 'api_error';
    }
  }

  /**
   * 创建成功响应
   */
  createSuccessResponse(data: any): Response {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version'
      }
    });
  }
}