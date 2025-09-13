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
  handleGeminiResponse(response: ApiResponse, claudeModel: string): Response {
    try {
      // 检查错误响应
      if (response.statusCode >= 400) {
        const errorMessage = this.extractErrorMessage(response.body);
        return this.createErrorResponse(response.statusCode, errorMessage);
      }

      // 转换成功响应
      const claudeResponse = ResponseTransformer.transformResponse(response.body, claudeModel);

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