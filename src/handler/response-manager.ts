/**
 * 响应管理器 - Cloudflare Workers版本
 * 处理响应的创建和转换
 */

import { ApiResponse } from '../client';
import { ResponseTransformer } from '../transformers/response-transformer';
import { ClaudeResponse } from '../types/claude';
import { createErrorResponse as createError, createSuccessResponse } from '../utils/response';
import { createResponseHeaders } from '../utils/cors';
import { getErrorTypeFromStatus, createErrorContext } from '../utils/common';

export class ResponseManager {
  /**
   * 创建错误响应
   */
  createErrorResponse(statusCode: number, message: string): Response {
    return createError(statusCode, message, true);
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
        headers: createResponseHeaders('application/json')
      });

    } catch (error) {
      // 记录响应转换错误的详细信息
      const errorContext = createErrorContext(
        'ResponseManager',
        'handleGeminiResponse',
        error,
        {
          claudeModel,
          exposeThinkingToClient,
          responseStatus: response.statusCode,
          hasResponseBody: !!response.body,
          responseBodyType: response.body ? typeof response.body : 'undefined',
          responseHeaders: Object.keys(response.headers || {})
        }
      );

      return this.createErrorResponse(
        500,
        errorContext.originalError.message
      );
    }
  }

  /**
   * 处理Gemini错误响应
   */
  private handleGeminiError(response: ApiResponse): Response {
    const body = response.body || {};
    const statusCode = response.statusCode;

    // 记录原始Gemini错误详情
    const errorContext = {
      component: 'ResponseManager',
      operation: 'handleGeminiError',
      statusCode,
      originalError: body,
      timestamp: new Date().toISOString(),
      errorAnalysis: {
        hasErrorObject: !!body?.error,
        errorCode: body?.error?.code,
        errorStatus: body?.error?.status,
        errorMessage: body?.error?.message,
        hasDetails: !!(body?.error?.details && Array.isArray(body?.error?.details)),
        detailsCount: body?.error?.details?.length || 0
      }
    };


    // 提取详细错误信息
    let errorMessage = this.extractErrorMessage(body);
    let errorType = getErrorTypeFromStatus(statusCode);

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
      } else if (geminiError.code === 'FAILED_PRECONDITION' &&
                 geminiError.message?.toLowerCase().includes('conversation')) {
        // 处理包含 isNewTopic 或其他对话终止相关的错误
        errorType = 'invalid_request_error';
        errorMessage = 'Conversation was terminated. Please start a new conversation.';
      }

      // 添加更多详细信息
      if (geminiError.details && Array.isArray(geminiError.details)) {
        const details = geminiError.details.map((d: any, index: number) => {
          const detailStr = typeof d === 'string' ? d : JSON.stringify(d);
          return detailStr;
        }).join('; ');

        if (details) {
          errorMessage += ` Details: ${details}`;
        }
      }

      // 添加调试信息到错误消息
      if (geminiError.code && geminiError.status) {
        errorMessage += ` (Code: ${geminiError.code}, Status: ${geminiError.status})`;
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
      headers: createResponseHeaders('application/json')
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
   * 创建成功响应
   */
  createSuccessResponse(data: any): Response {
    return createSuccessResponse(data, true);
  }
}