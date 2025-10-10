/**
 * Count Tokens 转换器
 * 负责将 Claude count_tokens 请求转换为 Gemini countTokens 格式
 */

import { ClaudeCountRequest } from '../types/claude';
import { ContentTransformer } from './content-transformer';

/**
 * Gemini countTokens 请求格式
 */
export interface GeminiCountTokensRequest {
  contents: Array<{
    role: string;
    parts: Array<{ text: string }>;
  }>;
  systemInstruction?: {
    role: string;
    parts: Array<{ text: string }>;
  };
}

/**
 * Gemini countTokens 响应格式
 */
export interface GeminiCountTokensResponse {
  totalTokens: number;
  cachedContentTokenCount?: number;
}

/**
 * Claude count_tokens 响应格式
 */
export interface ClaudeCountTokensResponse {
  input_tokens: number;
}

export class CountTokensTransformer {
  /**
   * 转换 Claude count_tokens 请求到 Gemini countTokens 格式
   */
  static async transformCountRequest(
    claudeRequest: ClaudeCountRequest
  ): Promise<GeminiCountTokensRequest> {
    const geminiRequest: GeminiCountTokensRequest = {
      contents: []
    };

    // 1. 转换消息
    if (claudeRequest.messages && claudeRequest.messages.length > 0) {
      for (const message of claudeRequest.messages) {
        const parts = await ContentTransformer.transformContent(message.content);

        // 只提取文本部分用于计数
        const textParts = parts
          .filter(p => 'text' in p && p.text)
          .map(p => ({ text: (p as any).text }));

        if (textParts.length > 0) {
          geminiRequest.contents.push({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: textParts
          });
        }
      }
    }

    // 2. 转换系统消息
    if (claudeRequest.system) {
      const systemText = typeof claudeRequest.system === 'string'
        ? claudeRequest.system
        : Array.isArray(claudeRequest.system)
          ? claudeRequest.system.map(s => s.text).join('\n')
          : '';

      if (systemText) {
        geminiRequest.systemInstruction = {
          role: 'system',
          parts: [{ text: systemText }]
        };
      }
    }

    return geminiRequest;
  }

  /**
   * 转换 Gemini countTokens 响应到 Claude 格式
   */
  static transformCountResponse(
    geminiResponse: GeminiCountTokensResponse
  ): ClaudeCountTokensResponse {
    return {
      input_tokens: geminiResponse.totalTokens || 0
    };
  }

  /**
   * 验证 count_tokens 请求
   */
  static validateCountRequest(request: ClaudeCountRequest): string | null {
    if (!request.model) {
      return 'Missing required field: model';
    }

    if (!request.messages || !Array.isArray(request.messages)) {
      return 'Missing or invalid field: messages (must be an array)';
    }

    if (request.messages.length === 0) {
      return 'messages array cannot be empty';
    }

    // 验证每条消息
    for (let i = 0; i < request.messages.length; i++) {
      const message = request.messages[i];

      if (!message.role) {
        return `messages[${i}]: Missing required field: role`;
      }

      if (!['user', 'assistant'].includes(message.role)) {
        return `messages[${i}]: Invalid role: ${message.role}. Must be 'user' or 'assistant'`;
      }

      if (!message.content) {
        return `messages[${i}]: Missing required field: content`;
      }
    }

    return null; // 验证通过
  }
}
