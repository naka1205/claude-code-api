/**
 * Thinking转换器 - Cloudflare Workers版本
 * 处理Extended Thinking特性的转换
 */

import { ClaudeRequest } from '../types/claude';
import { ModelMapper } from '../models';

export interface ThinkingConfig {
  thinkingBudget?: number;
  includeThoughts?: boolean;
  exposeToClient?: boolean;
}

export interface ThinkingRecommendation {
  recommended: boolean;
  reason: string;
  suggestedBudget?: number;
  modelSupport: boolean;
}

export class ThinkingTransformer {
  /**
   * 转换thinking配置
   */
  static transformThinking(
    thinking: any,
    geminiModel: string,
    claudeRequest: ClaudeRequest
  ): ThinkingConfig | null {
    if (!thinking || thinking.type !== 'enabled') {
      return null;
    }

    const modelMapper = ModelMapper.getInstance();
    const capabilities = modelMapper.getModelCapabilities(geminiModel);

    if (!capabilities.supportsThinking) {
      return null;
    }

    const config: ThinkingConfig = {
      includeThoughts: true,
      exposeToClient: thinking.expose_to_client || false
    };

    // 计算thinking budget
    if (thinking.budget) {
      config.thinkingBudget = thinking.budget;
    } else {
      // 根据请求复杂度自动计算budget
      config.thinkingBudget = this.calculateThinkingBudget(claudeRequest);
    }

    return config;
  }

  /**
   * 获取thinking推荐配置
   */
  static getThinkingRecommendation(
    claudeRequest: ClaudeRequest,
    geminiModel: string
  ): ThinkingRecommendation {
    const modelMapper = ModelMapper.getInstance();
    const capabilities = modelMapper.getModelCapabilities(geminiModel);

    // 检查模型是否支持thinking
    if (!capabilities.supportsThinking) {
      return {
        recommended: false,
        reason: 'Model does not support extended thinking',
        modelSupport: false
      };
    }

    // 分析请求复杂度
    const complexity = this.analyzeRequestComplexity(claudeRequest);

    if (complexity.score > 70) {
      return {
        recommended: true,
        reason: 'Complex request would benefit from extended thinking',
        suggestedBudget: this.calculateThinkingBudget(claudeRequest),
        modelSupport: true
      };
    }

    if (complexity.hasComplexTools) {
      return {
        recommended: true,
        reason: 'Tool usage would benefit from thinking',
        suggestedBudget: 5000,
        modelSupport: true
      };
    }

    return {
      recommended: false,
      reason: 'Request is simple enough without thinking',
      modelSupport: true
    };
  }

  /**
   * 分析请求复杂度
   */
  private static analyzeRequestComplexity(claudeRequest: ClaudeRequest): {
    score: number;
    hasComplexTools: boolean;
    factors: string[];
  } {
    let score = 0;
    const factors: string[] = [];

    // 检查消息长度
    const messageCount = claudeRequest.messages?.length || 0;
    if (messageCount > 10) {
      score += 20;
      factors.push('long conversation');
    }

    // 检查工具使用
    const hasTools = claudeRequest.tools && claudeRequest.tools.length > 0;
    const hasComplexTools = hasTools && claudeRequest.tools!.some(tool =>
      this.isComplexTool(tool as any)
    );

    if (hasComplexTools) {
      score += 30;
      factors.push('complex tools');
    } else if (hasTools) {
      score += 15;
      factors.push('tool usage');
    }

    // 检查系统提示复杂度
    if (claudeRequest.system) {
      const systemLength = typeof claudeRequest.system === 'string'
        ? claudeRequest.system.length
        : JSON.stringify(claudeRequest.system).length;

      if (systemLength > 1000) {
        score += 20;
        factors.push('complex system prompt');
      }
    }

    // 检查请求的tokens数量
    if (claudeRequest.max_tokens && claudeRequest.max_tokens > 4000) {
      score += 15;
      factors.push('long output expected');
    }

    // 检查消息内容复杂度
    const hasCodeBlocks = claudeRequest.messages?.some(msg => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return content.includes('```') || content.includes('function') || content.includes('class');
    });

    if (hasCodeBlocks) {
      score += 20;
      factors.push('code analysis');
    }

    return {
      score,
      hasComplexTools: hasComplexTools || false,
      factors
    };
  }

  /**
   * 计算thinking budget
   */
  private static calculateThinkingBudget(claudeRequest: ClaudeRequest): number {
    const complexity = this.analyzeRequestComplexity(claudeRequest);

    // 基础budget
    let budget = 2000;

    // 根据复杂度调整
    if (complexity.score > 80) {
      budget = 10000;
    } else if (complexity.score > 60) {
      budget = 7000;
    } else if (complexity.score > 40) {
      budget = 5000;
    } else if (complexity.score > 20) {
      budget = 3000;
    }

    // 限制最大值
    return Math.min(budget, 20000);
  }

  /**
   * 判断是否为复杂工具
   */
  private static isComplexTool(tool: any): boolean {
    const complexToolNames = [
      'code_interpreter',
      'web_browser',
      'data_analyzer',
      'sql_executor',
      'api_caller'
    ];

    return complexToolNames.some(name =>
      tool.name?.toLowerCase().includes(name.toLowerCase())
    );
  }

  /**
   * 从响应中提取thinking内容
   */
  static extractThinkingFromResponse(response: any): {
    thoughts?: string;
    thoughtsTokenCount?: number;
  } | null {
    // 检查是否有thinking内容
    if (!response.candidates?.[0]?.content?.parts) {
      return null;
    }

    for (const part of response.candidates[0].content.parts) {
      if (part.thought) {
        return {
          thoughts: part.thought,
          thoughtsTokenCount: part.thoughtTokenCount
        };
      }
    }

    // 检查usageMetadata中的thinking tokens
    if (response.usageMetadata?.thoughtsTokenCount) {
      return {
        thoughtsTokenCount: response.usageMetadata.thoughtsTokenCount
      };
    }

    return null;
  }

  /**
   * 生成thinking签名 - 恢复自Node.js版本
   * 用于标识和追踪thinking内容
   */
  static generateThinkingSignature(thinkingContent: string): string {
    const timestamp = Date.now().toString(36);
    const hash = this.simpleHash(thinkingContent);
    return `sig_${hash}_${timestamp}`;
  }

  /**
   * 简单哈希函数
   */
  private static simpleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36).substring(0, 8);
  }

  /**
   * 处理thinking内容块 - 恢复自Node.js版本
   */
  static processThinkingContent(
    thinkingText: string,
    exposeToClient: boolean
  ): any | null {
    if (!exposeToClient || !thinkingText) return null;

    return {
      type: 'thinking',
      thinking: thinkingText,
      signature: this.generateThinkingSignature(thinkingText)
    };
  }

  /**
   * 验证thinking签名
   */
  static validateThinkingSignature(signature: string): boolean {
    if (!signature) return false;

    // 签名格式: sig_[hash]_[timestamp]
    const pattern = /^sig_[a-z0-9]{1,8}_[a-z0-9]+$/;
    return pattern.test(signature);
  }

  /**
   * 从签名中提取时间戳
   */
  static extractTimestampFromSignature(signature: string): number | null {
    if (!this.validateThinkingSignature(signature)) return null;

    const parts = signature.split('_');
    if (parts.length !== 3) return null;

    try {
      return parseInt(parts[2], 36);
    } catch {
      return null;
    }
  }
}