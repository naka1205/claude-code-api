/**
 * 响应转换器 - Cloudflare Workers版本
 * 负责将Gemini响应转换为Claude格式
 */

import {
  ClaudeResponse,
  ClaudeContentBlock,
  ClaudeTextBlock,
  ClaudeToolUse
} from '../types/claude';
import {
  GeminiResponse,
  GeminiCandidate,
  GeminiPart,
  GeminiFunctionCallPart
} from '../types/gemini';
import { ContentTransformer } from './content-transformer';
import { ToolTransformer } from './tool-transformer';

export class ResponseTransformer {
  /**
   * 转换Gemini响应到Claude格式
   */
  static transformResponse(geminiResponse: GeminiResponse, claudeModel: string): ClaudeResponse {
    try {
      // 获取第一个候选结果
      const candidate = geminiResponse.candidates?.[0];
      if (!candidate) {
        throw new Error('No response candidate available');
      }

      // 转换内容块
      const contentBlocks = this.transformContentBlocks(candidate);

      // 转换停止原因
      const { stopReason, stopSequence } = this.transformStopReason(candidate);

      // 转换使用统计
      const usage = this.transformUsage(geminiResponse);

      // 构建Claude响应
      const claudeResponse: ClaudeResponse = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'message',
        role: 'assistant',
        content: contentBlocks,
        model: claudeModel,
        stop_reason: stopReason,
        stop_sequence: stopSequence,
        usage
      };

      return claudeResponse;
    } catch (error) {
      throw new Error(`Response transformation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 转换内容块
   */
  private static transformContentBlocks(candidate: GeminiCandidate): ClaudeContentBlock[] {
    const blocks: ClaudeContentBlock[] = [];

    if (!candidate.content || !candidate.content.parts) {
      return blocks;
    }

    for (const part of candidate.content.parts) {
      const block = this.transformPart(part);
      if (block) {
        blocks.push(block);
      }
    }

    // 如果没有内容块，添加一个空文本块
    if (blocks.length === 0) {
      blocks.push({ type: 'text', text: '' });
    }

    return blocks;
  }

  /**
   * 转换单个部分
   */
  private static transformPart(part: GeminiPart): ClaudeContentBlock | null {
    // 文本部分
    if ('text' in part) {
      return {
        type: 'text',
        text: part.text
      } as ClaudeTextBlock;
    }

    // 函数调用部分
    if ('functionCall' in part) {
      const functionCall = part as GeminiFunctionCallPart;
      return ToolTransformer.convertFunctionCallToToolUse(functionCall.functionCall) as ClaudeToolUse;
    }

    return null;
  }

  /**
   * 转换停止原因
   */
  private static transformStopReason(candidate: GeminiCandidate): {
    stopReason: ClaudeResponse['stop_reason'];
    stopSequence: string | null;
  } {
    const finishReason = candidate.finishReason?.toUpperCase();

    let stopReason: ClaudeResponse['stop_reason'] = 'end_turn';
    let stopSequence: string | null = null;

    switch (finishReason) {
      case 'STOP':
        stopReason = 'end_turn';
        break;
      case 'MAX_TOKENS':
        stopReason = 'max_tokens';
        break;
      case 'STOP_SEQUENCE':
        stopReason = 'stop_sequence';
        // Gemini不返回具体的停止序列
        stopSequence = null;
        break;
      case 'TOOL_CALLS':
      case 'FUNCTION_CALL':
        stopReason = 'tool_use';
        break;
      default:
        stopReason = 'end_turn';
    }

    return { stopReason, stopSequence };
  }

  /**
   * 转换使用统计
   */
  private static transformUsage(geminiResponse: GeminiResponse): ClaudeResponse['usage'] {
    const metadata = geminiResponse.usageMetadata;

    return {
      input_tokens: metadata?.promptTokenCount || 0,
      output_tokens: metadata?.candidatesTokenCount || 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: metadata?.cachedContentTokenCount || 0
    };
  }

  /**
   * 转换错误响应
   */
  static transformErrorResponse(error: any): any {
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal server error';

    return {
      type: 'error',
      error: {
        type: this.getErrorType(statusCode),
        message: message
      }
    };
  }

  /**
   * 获取错误类型
   */
  private static getErrorType(statusCode: number): string {
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
}