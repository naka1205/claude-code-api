/**
 * 响应转换器
 * 基于官方文档实现Gemini到Claude响应的正确转换
 * 确保与流式输出保持一致的内容块处理逻辑
 */

import {
  ClaudeResponse,
  ClaudeContentBlock,
  ClaudeTextBlock,
  ClaudeThinkingBlock,
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
import { ThinkingTransformer } from './thinking-transformer';

export interface ResponseTransformOptions {
  exposeThinkingToClient?: boolean;
  includeUsageStats?: boolean;
  validateOutput?: boolean;
}

export class ResponseTransformer {
  private static defaultOptions: ResponseTransformOptions = {
    exposeThinkingToClient: false,
    includeUsageStats: true,
    validateOutput: true
  };
  /**
   * 生成符合Claude格式的消息ID
   */
  private static generateClaudeMessageId(): string {
    // 生成25位随机字符串，符合Claude ID格式
    const randomString = Math.random().toString(36).substr(2, 15) +
                        Math.random().toString(36).substr(2, 10);
    return `msg_${randomString.substr(0, 25)}`;
  }

  /**
   * 转换Gemini响应到Claude格式
   */
  static async transformResponse(
    geminiResponse: GeminiResponse,
    claudeModel: string,
    exposeThinkingToClient: boolean = false,
    options?: ResponseTransformOptions
  ): Promise<ClaudeResponse> {
    const transformOptions = { ...this.defaultOptions, exposeThinkingToClient, ...options };
    try {
      // 获取第一个候选结果
      let candidate = geminiResponse.candidates?.[0];
      if (!candidate) {
        throw new Error('No response candidate available');
      }

      // 简化日志记录，仅在debug模式下输出详细信息
      // if (process.env.DEBUG_TRANSFORM === 'true') {
      //   Logger.debug('ResponseTransformer', 'Response summary', {
      //     finishReason: candidate.finishReason,
      //     partsCount: candidate.content?.parts?.length || 0,
      //     totalTokens: geminiResponse.usageMetadata?.totalTokenCount
      //   });
      // }

      // 转换内容块
      let contentBlocks = await this.transformContentBlocks(candidate, transformOptions.exposeThinkingToClient);

      // 处理Google Search的grounding metadata引用
      if (geminiResponse.candidates && geminiResponse.candidates[0] && (geminiResponse.candidates[0] as any).groundingAttributions) {
        contentBlocks = this.appendGroundingAttributions(
          contentBlocks,
          (geminiResponse.candidates[0] as any).groundingAttributions
        );
      }

      // 转换停止原因
      const { stopReason, stopSequence } = this.transformStopReason(candidate);

      // 转换使用统计
      const usage = transformOptions.includeUsageStats
        ? this.transformUsage(geminiResponse, transformOptions.exposeThinkingToClient)
        : {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0
          };

      // 构建Claude响应
      const claudeResponse: ClaudeResponse = {
        id: this.generateClaudeMessageId(),
        type: 'message',
        role: 'assistant',
        content: contentBlocks,
        model: claudeModel,
        stop_reason: stopReason,
        stop_sequence: stopSequence,
        usage
      };

      // 仅在debug模式下进行质量验证
      if (transformOptions.validateOutput && process.env.DEBUG_QUALITY === 'true') {
        this.calculateResponseQuality(claudeResponse);
      }

      return claudeResponse;
    } catch (error) {
      throw new Error(`Response transformation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 转换内容块
   */
  private static async transformContentBlocks(
    candidate: GeminiCandidate,
    exposeThinkingToClient: boolean = false
  ): Promise<ClaudeContentBlock[]> {
    // 快速检查是否有内容
    if (!candidate.content?.parts?.length) {
      // 检查是否在candidate级别有思考内容
      const fallbackContent = (candidate as any).content?.text || (candidate as any).thinking;
      if (fallbackContent && exposeThinkingToClient) {
        const { thinking, response } = ThinkingTransformer.separateThinkingAndResponse(fallbackContent);
        const blocks: ClaudeContentBlock[] = [];

        if (thinking) {
          blocks.push({
            type: 'thinking',
            thinking: thinking,
            signature: ThinkingTransformer.generateThinkingSignature(thinking)
          } as ClaudeThinkingBlock);
        }

        if (response) {
          blocks.push({ type: 'text', text: response });
        }

        return blocks.length > 0 ? blocks : [{ type: 'text', text: fallbackContent }];
      }

      return [{ type: 'text', text: fallbackContent || '' }];
    }

    // 使用ContentTransformer处理内容块
    let result = await ContentTransformer.processToolCallsAndResults(
      candidate.content.parts,
      exposeThinkingToClient
    );

    // Fallback处理：确保与流式输出一致的thinking处理
    if (result.length === 0 || (result.length === 1 && result[0].type === 'text' && !(result[0] as any).text?.trim())) {
      const hasThinkingParts = candidate.content.parts.some((p: any) => 'thought' in p && p.thought);
      const hasRegularParts = candidate.content.parts.some((p: any) => 'text' in p && !('thought' in p));

      if (hasThinkingParts && !hasRegularParts && !exposeThinkingToClient) {
        // 与流式输出保持一致：提供简单的响应而不是暴露thinking内容
        return [{
          type: 'text',
          text: 'I have completed the analysis. To see the detailed reasoning process, please enable thinking mode.'
        }];
      }
    }

    return result;
  }

  /**
   * 转换单个部分
   */
  private static transformPart(part: GeminiPart, options?: ResponseTransformOptions): ClaudeContentBlock | null {
    // 文本部分 - 排除带thought或thoughtSignature标记的内容
    if ('text' in part && !('thought' in part) && !('thoughtSignature' in part)) {
      return {
        type: 'text',
        text: part.text
      } as ClaudeTextBlock;
    }

    // 函数调用部分
    if ('functionCall' in part) {
      const functionCall = part as GeminiFunctionCallPart;


      // 生成工具使用ID - 与流式输出保持一致的格式
      const timestamp = Date.now();
      const random = Math.random().toString(36).substr(2, 9);
      const toolUseId = `toolu_${timestamp}_${random}`;

      // 处理args - 可能是字符串或对象
      let args = functionCall.functionCall.args || {};

      if (typeof args === 'string') {
        try {
          args = JSON.parse(args);
        } catch (e) {
          args = {};
        }
      }

      return {
        type: 'tool_use',
        id: toolUseId,
        name: functionCall.functionCall.name,
        input: args
      } as ClaudeToolUse;
    }

    // 函数响应部分
    if ('functionResponse' in part) {
      const functionResponse = part.functionResponse;
      // 为工具结果生成ID，通常在实际实现中这个ID应该来自之前的tool_use
      const toolUseId = `toolu_${Math.random().toString(36).substr(2, 23)}`;
      return {
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: JSON.stringify(functionResponse.response),
        is_error: false
      } as any;
    }

    // 思考内容部分 - 支持thought和thoughtSignature两种格式
    if (('thought' in part && 'text' in part) || ('thoughtSignature' in part && 'text' in part)) {
      const shouldExpose = options?.exposeThinkingToClient ?? false;

      // Logger.info('ResponseTransformer', 'Processing thinking content part', {
      //   thoughtFlag: (part as any).thought,
      //   textLength: (part as any).text?.length || 0,
      //   shouldExpose,
      //   clientRequestedThinking: shouldExpose
      // });

      if (shouldExpose) {
        // 按照Claude格式返回thinking block，内容从text字段获取
        // Logger.debug('ResponseTransformer', 'Creating thinking block from text field', {
        //   thoughtFlag: (part as any).thought,
        //   textLength: (part as any).text?.length || 0,
        //   exposeToClient: shouldExpose
        // });

        return {
          type: 'thinking',
          thinking: (part as any).text, // 思考内容在text字段中
          signature: ThinkingTransformer.generateThinkingSignature((part as any).text)
        } as ClaudeThinkingBlock;
      } else {
        // 不暴露思考内容时，过滤掉
        // Logger.debug('ResponseTransformer', 'FILTERING OUT thinking content - client did not enable thinking exposure', {
        //   textLength: (part as any).text?.length || 0,
        //   shouldExpose,
        //   reason: 'Client did not enable thinking mode'
        // });
        return null;
      }
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
        // Logger.warn('ResponseTransformer', 'Response terminated: MAX_TOKENS reached');
        break;
      case 'STOP_SEQUENCE':
        stopReason = 'stop_sequence';
        stopSequence = null;
        break;
      case 'TOOL_CALLS':
      case 'FUNCTION_CALL':
        stopReason = 'tool_use';
        break;
      case 'SAFETY':
      case 'RECITATION':
        // 处理安全过滤和内容重复等情况，映射为 end_turn
        stopReason = 'end_turn';
        // Logger.warn('ResponseTransformer', `Response terminated due to safety/recitation: ${finishReason}`);
        break;
      case 'OTHER':
        // Gemini 的 OTHER 状态，可能包含 isNewTopic 等特殊终止原因
        stopReason = 'end_turn';
        // Logger.info('ResponseTransformer', 'Response terminated with OTHER reason (may include isNewTopic)');
        break;
      default:
        if (finishReason) {
          // Logger.warn('ResponseTransformer', `Unknown finish reason: ${finishReason}`);
        }
        stopReason = 'end_turn';
    }

    return { stopReason, stopSequence };
  }

  /**
   * 转换使用统计
   */
  private static transformUsage(
    geminiResponse: GeminiResponse,
    includeThinkingTokens: boolean = false
  ): ClaudeResponse['usage'] {
    const metadata = geminiResponse.usageMetadata;

    const usage: any = {
      input_tokens: metadata?.promptTokenCount || 0,
      output_tokens: metadata?.candidatesTokenCount || 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: metadata?.cachedContentTokenCount || 0
    };

    // 添加thinking tokens计数 - 优先使用usageMetadata中的值
    if (includeThinkingTokens) {
      if (metadata?.thoughtsTokenCount) {
        // 直接使用Gemini API返回的思维令牌计数
        usage.thoughts_output_tokens = metadata.thoughtsTokenCount;
      } else {
        // 后备方案：从响应内容中提取
        const thinkingData = ThinkingTransformer.extractThinkingFromResponse(geminiResponse);
        if (thinkingData?.thoughtsTokenCount) {
          usage.thoughts_output_tokens = thinkingData.thoughtsTokenCount;
        }
      }
    }

    // 计算总计数
    if (metadata?.totalTokenCount !== undefined) {
      const calculated = usage.input_tokens + usage.output_tokens + (usage.thoughts_output_tokens || 0);
      if (Math.abs(calculated - metadata.totalTokenCount) < 10) {
        usage.total_tokens = metadata.totalTokenCount;
      }
    }

    return usage;
  }

  /**
   * 转换错误响应 - 增强版
   * 支持更详细的错误类型映射和信息
   */
  static transformErrorResponse(error: any): any {
    const statusCode = error.statusCode || error.code || 500;
    let message = error.message || 'Internal server error';
    let errorType = this.getErrorType(statusCode);

    // 处理Gemini特定的错误响应
    if (error.body?.error) {
      const geminiError = error.body.error;
      message = geminiError.message || message;

      // 映射Gemini错误类型到Claude错误类型
      if (geminiError.status) {
        errorType = this.mapGeminiErrorType(geminiError.status);
      }

      // 添加更详细的错误信息
      if (geminiError.details && Array.isArray(geminiError.details)) {
        const details = geminiError.details.map((d: any) => d.reason || d.message).join('; ');
        if (details) {
          message = `${message} - ${details}`;
        }
      }
    }

    // 处理特定的错误场景
    const enhancedMessage = this.enhanceErrorMessage(errorType, message, error);

    return {
      type: 'error',
      error: {
        type: errorType,
        message: enhancedMessage
      }
    };
  }

  /**
   * 获取错误类型 - 增强版
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
      case 409:
        return 'conflict_error';
      case 413:
        return 'request_too_large';
      case 429:
        return 'rate_limit_error';
      case 500:
        return 'api_error';
      case 502:
      case 503:
        return 'service_unavailable';
      case 504:
        return 'timeout_error';
      default:
        return statusCode >= 500 ? 'api_error' : 'invalid_request_error';
    }
  }

  /**
   * 映射Gemini错误类型到Claude错误类型
   */
  private static mapGeminiErrorType(geminiStatus: string): string {
    const statusMap: Record<string, string> = {
      'INVALID_ARGUMENT': 'invalid_request_error',
      'DEADLINE_EXCEEDED': 'timeout_error',
      'NOT_FOUND': 'not_found_error',
      'ALREADY_EXISTS': 'conflict_error',
      'PERMISSION_DENIED': 'permission_error',
      'UNAUTHENTICATED': 'authentication_error',
      'RESOURCE_EXHAUSTED': 'rate_limit_error',
      'FAILED_PRECONDITION': 'invalid_request_error',
      'ABORTED': 'request_aborted',
      'OUT_OF_RANGE': 'invalid_request_error',
      'UNIMPLEMENTED': 'not_implemented_error',
      'INTERNAL': 'api_error',
      'UNAVAILABLE': 'service_unavailable',
      'DATA_LOSS': 'api_error'
    };

    return statusMap[geminiStatus] || 'api_error';
  }

  /**
   * 增强错误消息
   */
  private static enhanceErrorMessage(errorType: string, message: string, originalError: any): string {
    // 添加更有帮助的错误信息
    switch (errorType) {
      case 'rate_limit_error':
        return `${message}. Please retry after a short delay or use multiple API keys.`;

      case 'authentication_error':
        return `${message}. Please check your API key is valid and has the necessary permissions.`;

      case 'request_too_large':
        return `${message}. The request exceeds the maximum allowed size. Consider reducing the input or using streaming.`;

      case 'timeout_error':
        return `${message}. The request took too long to process. Consider using a simpler prompt or breaking it into smaller requests.`;

      case 'service_unavailable':
        return `${message}. The service is temporarily unavailable. Please retry in a few moments.`;

      case 'invalid_request_error':
        // 检查是否是特定的参数错误
        if (message.includes('temperature') || message.includes('top_p')) {
          return `${message}. Note: temperature should be between 0 and 1, and it's recommended not to use both temperature and top_p together.`;
        }
        if (message.includes('max_tokens') || message.includes('maxOutputTokens')) {
          return `${message}. Please check the token limits for the selected model.`;
        }
        break;
    }

    return message;
  }

  /**
   * 计算响应质量评分 - 恢复自Node.js版本
   */
  static calculateResponseQuality(response: ClaudeResponse): {
    score: number;
    factors: {
      hasContent: boolean;
      contentLength: number;
      hasToolUse: boolean;
      stopReasonValid: boolean;
      tokensReasonable: boolean;
    };
  } {
    let score = 100;
    const factors = {
      hasContent: response.content && response.content.length > 0,
      contentLength: 0,
      hasToolUse: false,
      stopReasonValid: ['end_turn', 'max_tokens', 'stop_sequence', 'tool_use'].includes(response.stop_reason || ''),
      tokensReasonable: true
    };

    // 检查内容存在性
    if (!factors.hasContent) {
      score -= 30;
    }

    // 分析内容质量
    if (response.content) {
      factors.contentLength = response.content.reduce((total, block) => {
        if (block.type === 'text' && (block as any).text) {
          return total + (block as any).text.length;
        }
        if (block.type === 'tool_use') {
          factors.hasToolUse = true;
        }
        return total;
      }, 0);

      // 检查内容长度
      if (factors.contentLength < 10 && !factors.hasToolUse) {
        score -= 20;
      }
    }

    // 检查停止原因
    if (!factors.stopReasonValid) {
      score -= 10;
    }

    // 检查token使用
    const totalTokens = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);
    if (totalTokens === 0) {
      score -= 10;
      factors.tokensReasonable = false;
    }

    return { score, factors };
  }

  /**
   * 收集响应诊断信息 - 恢复自Node.js版本
   */
  static collectResponseDiagnostics(geminiResponse: any): {
    candidatesCount: number;
    finishReason: string | null;
    hasContent: boolean;
    partsCount: number;
    partTypes: string[];
    usageMetadata: any;
    promptFeedback: any;
  } {
    const candidates = Array.isArray(geminiResponse?.candidates) ? geminiResponse.candidates : [];
    const firstCandidate = candidates[0] || {};
    const parts = Array.isArray(firstCandidate?.content?.parts) ? firstCandidate.content.parts : [];

    const diagnostics = {
      candidatesCount: candidates.length,
      finishReason: firstCandidate?.finishReason || null,
      hasContent: !!firstCandidate?.content,
      partsCount: parts.length,
      partTypes: parts.map((p: any) => {
        if (p && typeof p === 'object') {
          if ('text' in p) return 'text';
          if ('functionCall' in p) return 'functionCall';
          if ('functionResponse' in p) return 'functionResponse';
          if ('thought' in p) return 'thought';
          return Object.keys(p).join('+') || 'object';
        }
        return typeof p;
      }),
      usageMetadata: geminiResponse?.usageMetadata || {},
      promptFeedback: geminiResponse?.promptFeedback || null
    };

    return diagnostics;
  }

  /**
   * 验证响应完整性
   */
  static validateResponseIntegrity(response: ClaudeResponse): {
    isValid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // 检查必需字段
    if (!response.id) {
      issues.push('Missing response ID');
    }

    if (!response.type || response.type !== 'message') {
      issues.push('Invalid response type');
    }

    if (!response.role || response.role !== 'assistant') {
      issues.push('Invalid response role');
    }

    if (!response.model) {
      issues.push('Missing model identifier');
    }

    if (!Array.isArray(response.content)) {
      issues.push('Content must be an array');
    }

    if (!response.stop_reason) {
      issues.push('Missing stop reason');
    }

    // 检查usage字段
    if (response.usage) {
      if (typeof response.usage.input_tokens !== 'number') {
        issues.push('Invalid input_tokens in usage');
      }
      if (typeof response.usage.output_tokens !== 'number') {
        issues.push('Invalid output_tokens in usage');
      }
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  /**
   * 添加Google Search的grounding attributions引用信息
   */
  private static appendGroundingAttributions(
    contentBlocks: ClaudeContentBlock[],
    groundingAttributions: any[]
  ): ClaudeContentBlock[] {
    if (!groundingAttributions || groundingAttributions.length === 0) {
      return contentBlocks;
    }

    // 提取引用来源
    const sources = groundingAttributions.map((attr, index) => {
      const source = attr.source || attr.segment?.source || {};
      return {
        index: index + 1,
        title: source.title || `Source ${index + 1}`,
        uri: source.uri || source.url || ''
      };
    }).filter(source => source.uri);

    if (sources.length === 0) {
      return contentBlocks;
    }

    // 格式化来源文本
    let sourcesText = '\n\n**References:**\n';
    sources.forEach(source => {
      sourcesText += `${source.index}. **${source.title}**\n   ${source.uri}\n`;
    });

    // 找到最后一个文本块并追加引用信息
    let lastTextBlockIndex = -1;
    for (let i = contentBlocks.length - 1; i >= 0; i--) {
      if (contentBlocks[i]?.type === 'text') {
        lastTextBlockIndex = i;
        break;
      }
    }

    if (lastTextBlockIndex >= 0) {
      const lastTextBlock = contentBlocks[lastTextBlockIndex] as ClaudeTextBlock;
      contentBlocks[lastTextBlockIndex] = {
        ...lastTextBlock,
        text: lastTextBlock.text + sourcesText
      };
    } else {
      // 如果没有文本块，添加一个新的文本块包含引用信息
      contentBlocks.push({
        type: 'text',
        text: sourcesText.trim()
      });
    }

    return contentBlocks;
  }

}