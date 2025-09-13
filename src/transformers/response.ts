/**
 * 响应转换器 V2
 * 负责将Gemini格式响应转换为Claude格式
 */

import {
  ClaudeResponse,
  ClaudeContentBlock,
  ClaudeUsage
} from '../types/claude';
import {
  GeminiResponse,
  GeminiPart,
  GeminiUsageMetadata,
  GeminiCandidate
} from '../types/gemini';

import { ContentTransformer } from './content';

export interface ResponseTransformOptions {
  exposeThinkingToClient?: boolean;
  includeUsageStats?: boolean;
  validateOutput?: boolean;
}

export class ResponseTransformer {
  // 使用只读对象减少内存分配
  private static readonly defaultOptions: Readonly<ResponseTransformOptions> = Object.freeze({
    exposeThinkingToClient: false,
    includeUsageStats: true,
    validateOutput: true
  });

  /**
   * 主响应转换函数：将Gemini响应转换为Claude响应
   */
  static transformResponse(
    geminiResponse: GeminiResponse,
    originalModel: string,
    exposeThinkingToClient: boolean = false,
    options?: ResponseTransformOptions
  ): ClaudeResponse {
    const transformOptions = options
      ? Object.assign({}, this.defaultOptions, { exposeThinkingToClient }, options)
      : { ...this.defaultOptions, exposeThinkingToClient };

    try {
      if (!geminiResponse.candidates || geminiResponse.candidates.length === 0) {
        return this.createFallbackResponse(geminiResponse, originalModel);
      }

      const candidate = geminiResponse.candidates[0];

      // 转换内容块
      let contentBlocks: ClaudeContentBlock[] = [];
      if (candidate?.content?.parts) {
        contentBlocks = this.processToolCallsAndResults(
          candidate.content.parts, 
          transformOptions.exposeThinkingToClient!
        );
        
        // 处理Google Search的grounding metadata引用 (基于官方文档examples/Gemini.md:511行)
        if (geminiResponse.candidates[0]?.groundingAttributions) {
          contentBlocks = this.appendGroundingAttributions(
            contentBlocks, 
            geminiResponse.candidates[0].groundingAttributions
          );
        }
      } else {
        contentBlocks = this.createFallbackContentBlocks(candidate);
      }

      // 生成响应元数据
      const metadata = this.generateResponseMetadata(originalModel, candidate?.finishReason);

      // 转换使用统计
      const usage = transformOptions.includeUsageStats ? 
        this.transformUsage(geminiResponse.usageMetadata) : 
        { input_tokens: 0, output_tokens: 0 };

      const claudeResponse: ClaudeResponse = {
        ...metadata,
        content: contentBlocks,
        usage
      };

      // 验证输出
      if (transformOptions.validateOutput) {
        this.validateResponse(claudeResponse);
      }

      return claudeResponse;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Response transformation failed: ${errorMsg}`);
    }
  }

  /**
   * 处理工具调用和响应的配对
   */
  static processToolCallsAndResults(parts: GeminiPart[], exposeThinkingToClient: boolean = false): ClaudeContentBlock[] {
    return ContentTransformer.processToolCallsAndResults(parts, exposeThinkingToClient);
  }

  /**
   * 转换单个内容块
   */
  static transformContent(parts: GeminiPart[], exposeThinkingToClient: boolean = false): ClaudeContentBlock[] {
    return ContentTransformer.transformContent(parts, exposeThinkingToClient);
  }

  /**
   * 转换使用统计 - 根据Gemini官方文档优化
   */
  static transformUsage(usageMetadata?: GeminiUsageMetadata): ClaudeUsage {
    if (!usageMetadata) {
      return {
        input_tokens: 0,
        output_tokens: 0
      };
    }

    const usage: ClaudeUsage = {
      input_tokens: usageMetadata.promptTokenCount || 0,
      output_tokens: usageMetadata.candidatesTokenCount || 0
    };

    // 根据Gemini官方文档添加更多token统计字段
    if (usageMetadata.cachedContentTokenCount !== undefined) {
      usage.cache_read_input_tokens = usageMetadata.cachedContentTokenCount;
    }

    // 思考token计数 (如果有)
    if (usageMetadata.thoughtsTokenCount !== undefined) {
      usage.thoughts_output_tokens = usageMetadata.thoughtsTokenCount;
    }

    // 总token计数
    if (usageMetadata.totalTokenCount !== undefined) {
      // 验证总计数是否正确
      const calculated = usage.input_tokens + usage.output_tokens + (usage.thoughts_output_tokens || 0);
      if (Math.abs(calculated - usageMetadata.totalTokenCount) < 10) { // 允许小误差
        usage.total_tokens = usageMetadata.totalTokenCount;
      }
    }

    return usage;
  }

  /**
   * 添加Google Search的grounding attributions引用信息 (优化版本)
   */
  private static appendGroundingAttributions(
    contentBlocks: ClaudeContentBlock[],
    groundingAttributions: any[]
  ): ClaudeContentBlock[] {
    if (!groundingAttributions || groundingAttributions.length === 0) {
      return contentBlocks;
    }

    // 使用 StringBuilder 模式优化字符串拼接
    const sourceParts: string[] = ['\n\n**参考来源:**\n'];
    let hasValidSources = false;

    for (let i = 0; i < groundingAttributions.length; i++) {
      const attr = groundingAttributions[i];
      const source = attr.source || attr.segment?.source || {};
      const uri = source.uri || source.url || '';

      if (uri) {
        const title = source.title || `来源 ${i + 1}`;
        sourceParts.push(`${i + 1}. **${title}**\n   ${uri}\n`);
        hasValidSources = true;
      }
    }

    if (!hasValidSources) {
      return contentBlocks;
    }

    const sourcesText = sourceParts.join('');

    // 找到最后一个文本块并追加引用信息
    for (let i = contentBlocks.length - 1; i >= 0; i--) {
      if (contentBlocks[i]?.type === 'text') {
        const lastTextBlock = contentBlocks[i] as any;
        contentBlocks[i] = {
          ...lastTextBlock,
          text: lastTextBlock.text + sourcesText
        };
        return contentBlocks;
      }
    }

    // 如果没有文本块，添加一个新的文本块包含引用信息
    contentBlocks.push({
      type: 'text',
      text: sourcesText.trim()
    });

    return contentBlocks;
  }

  /**
   * 映射停止原因 - 使用查找表优化
   */
  private static readonly STOP_REASON_MAP: Readonly<Record<string, ClaudeResponse['stop_reason']>> = Object.freeze({
    'STOP': 'end_turn',
    'MAX_TOKENS': 'max_tokens',
    'SAFETY': 'end_turn',
    'RECITATION': 'end_turn',
    'LANGUAGE': 'end_turn',
    'PROHIBITED_CONTENT': 'end_turn',
    'SPII': 'end_turn',
    'MALFORMED_FUNCTION_CALL': 'end_turn',
    'OTHER': 'end_turn',
    'FINISH_REASON_UNSPECIFIED': 'end_turn'
  });

  static mapStopReason(finishReason?: string): ClaudeResponse['stop_reason'] {
    return finishReason ? (this.STOP_REASON_MAP[finishReason] || 'end_turn') : 'end_turn';
  }

  /**
   * 生成消息ID (优化版本)
   */
  static generateMessageId(): string {
    // 使用更高效的 ID 生成方式
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `msg_${timestamp}_${random}`;
  }

  /**
   * 生成工具使用ID (优化版本)
   */
  static generateToolUseId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `toolu_${timestamp}_${random}`;
  }

  /**
   * 生成响应元数据
   */
  private static generateResponseMetadata(
    originalModel: string,
    finishReason?: string
  ) {
    return {
      id: this.generateMessageId(),
      type: 'message' as const,
      role: 'assistant' as const,
      model: originalModel,
      stop_reason: this.mapStopReason(finishReason),
      stop_sequence: null
    };
  }

  /**
   * 创建回退响应（当没有候选时）
   */
  private static createFallbackResponse(
    geminiResponse: GeminiResponse,
    originalModel: string
  ): ClaudeResponse {
    const fallbackText = '上游未返回候选内容（No candidates found in Gemini response）。';
    const metadata = this.generateResponseMetadata(originalModel, undefined);
    const usage = this.transformUsage(geminiResponse.usageMetadata);

    return {
      ...metadata,
      content: [{ type: 'text', text: fallbackText }],
      usage
    };
  }

  /**
   * 创建回退内容块（当candidate没有有效内容时）
   */
  private static createFallbackContentBlocks(candidate?: GeminiCandidate): ClaudeContentBlock[] {
    const finishReason = candidate?.finishReason;
    const rawText = (candidate as any)?.content?.text || '';
    
    const text = typeof rawText === 'string' && rawText.trim().length > 0
      ? rawText
      : `上游返回空内容（finishReason=${finishReason || 'N/A'}）。`;

    return [{ type: 'text', text }];
  }

  /**
   * 验证响应格式
   */
  private static validateResponse(claudeResponse: ClaudeResponse): void {
    if (!claudeResponse.id) {
      throw new Error('Response missing ID');
    }
    
    if (claudeResponse.type !== 'message') {
      throw new Error('Invalid response type');
    }
    
    if (claudeResponse.role !== 'assistant') {
      throw new Error('Invalid response role');
    }
    
    if (!claudeResponse.model) {
      throw new Error('Response missing model');
    }
    
    if (!Array.isArray(claudeResponse.content)) {
      throw new Error('Response content must be an array');
    }
    
    if (!claudeResponse.stop_reason) {
      throw new Error('Response missing stop_reason');
    }
    
    if (!claudeResponse.usage) {
      throw new Error('Response missing usage statistics');
    }

    // 验证内容块
    claudeResponse.content.forEach((block, index) => {
      if (!block.type) {
        throw new Error(`Content block ${index} missing type`);
      }
      
      if (!['text', 'image', 'tool_use', 'tool_result', 'thinking'].includes(block.type)) {
        throw new Error(`Invalid content block type: ${block.type}`);
      }
    });
  }

  /**
   * 批量转换多个响应
   */
  static transformBatch(
    responses: GeminiResponse[],
    originalModels: string[],
    options?: ResponseTransformOptions
  ): Array<{
    success: boolean;
    response?: ClaudeResponse;
    error?: string;
    originalIndex: number;
  }> {
    return responses.map((response, index) => {
      try {
        const originalModel = originalModels[index] || 'claude-3-5-sonnet-20241022';
        const claudeResponse = this.transformResponse(response, originalModel, false, options);
        return {
          success: true,
          response: claudeResponse,
          originalIndex: index
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          originalIndex: index
        };
      }
    });
  }

  /**
   * 预览转换结果（不执行实际转换，只返回转换计划）
   */
  static previewTransformation(geminiResponse: GeminiResponse): {
    hasValidCandidates: boolean;
    candidateCount: number;
    contentAnalysis: {
      partsCount: number;
      hasText: boolean;
      hasFunctionCalls: boolean;
      hasFunctionResponses: boolean;
      hasThinking: boolean;
    };
    usageStats: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    } | undefined;
    estimatedContentBlocks: number;
    finishReason: string | undefined;
  } {
    const hasValidCandidates = !!(geminiResponse.candidates && geminiResponse.candidates.length > 0);
    const candidateCount = geminiResponse.candidates ? geminiResponse.candidates.length : 0;
    
    let contentAnalysis = {
      partsCount: 0,
      hasText: false,
      hasFunctionCalls: false,
      hasFunctionResponses: false,
      hasThinking: false
    };

    let estimatedContentBlocks = 0;
    let finishReason: string | undefined;

    if (hasValidCandidates) {
      const candidate = geminiResponse.candidates?.[0];
      finishReason = candidate?.finishReason;
      
      if (candidate?.content && candidate.content.parts) {
        const parts = candidate.content.parts;
        contentAnalysis.partsCount = parts.length;
        
        parts.forEach(part => {
          if (part.text) {
            contentAnalysis.hasText = true;
            estimatedContentBlocks++;
          }
          if (part.functionCall) {
            contentAnalysis.hasFunctionCalls = true;
            estimatedContentBlocks++;
          }
          if (part.functionResponse) {
            contentAnalysis.hasFunctionResponses = true;
            estimatedContentBlocks++;
          }
          if (part.thought || part.thoughtSignature) {
            contentAnalysis.hasThinking = true;
            estimatedContentBlocks++;
          }
        });
      }
    }

    const usageStats = geminiResponse.usageMetadata ? {
      inputTokens: geminiResponse.usageMetadata.promptTokenCount || 0,
      outputTokens: geminiResponse.usageMetadata.candidatesTokenCount || 0,
      totalTokens: geminiResponse.usageMetadata.totalTokenCount || 0
    } : undefined;

    return {
      hasValidCandidates,
      candidateCount,
      contentAnalysis,
      usageStats,
      estimatedContentBlocks,
      finishReason
    };
  }

  /**
   * 计算响应质量分数
   */
  static calculateResponseQuality(claudeResponse: ClaudeResponse): {
    score: number;
    factors: {
      hasContent: boolean;
      contentLength: number;
      hasValidStopReason: boolean;
      hasUsageStats: boolean;
      contentTypeDistribution: Record<string, number>;
    };
  } {
    const factors = {
      hasContent: claudeResponse.content.length > 0,
      contentLength: 0,
      hasValidStopReason: claudeResponse.stop_reason !== null,
      hasUsageStats: !!claudeResponse.usage,
      contentTypeDistribution: {} as Record<string, number>
    };

    // 计算内容长度和类型分布
    claudeResponse.content.forEach(block => {
      factors.contentTypeDistribution[block.type] = 
        (factors.contentTypeDistribution[block.type] || 0) + 1;
      
      if (block.type === 'text' && block.text) {
        factors.contentLength += block.text.length;
      }
    });

    // 计算质量分数 (0-100)
    let score = 0;
    
    if (factors.hasContent) score += 40;
    if (factors.contentLength > 10) score += 30;
    if (factors.hasValidStopReason) score += 15;
    if (factors.hasUsageStats) score += 10;
    if (Object.keys(factors.contentTypeDistribution).length > 1) score += 5; // 多样化内容类型

    return { score, factors };
  }

  /**
   * 获取响应统计信息
   */
  static getResponseStats(claudeResponse: ClaudeResponse): {
    id: string;
    model: string;
    contentBlockCount: number;
    totalTextLength: number;
    toolUseCount: number;
    thinkingBlockCount: number;
    stopReason: string;
    tokenUsage: {
      input: number;
      output: number;
      total: number;
    };
  } {
    let totalTextLength = 0;
    let toolUseCount = 0;
    let thinkingBlockCount = 0;

    claudeResponse.content.forEach(block => {
      switch (block.type) {
        case 'text':
          if (block.text) totalTextLength += block.text.length;
          break;
        case 'tool_use':
          toolUseCount++;
          break;
        case 'thinking':
          thinkingBlockCount++;
          if (block.thinking) totalTextLength += block.thinking.length;
          break;
      }
    });

    return {
      id: claudeResponse.id,
      model: claudeResponse.model,
      contentBlockCount: claudeResponse.content.length,
      totalTextLength,
      toolUseCount,
      thinkingBlockCount,
      stopReason: claudeResponse.stop_reason,
      tokenUsage: {
        input: claudeResponse.usage.input_tokens,
        output: claudeResponse.usage.output_tokens,
        total: claudeResponse.usage.input_tokens + claudeResponse.usage.output_tokens
      }
    };
  }
}