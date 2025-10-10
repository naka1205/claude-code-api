/**
 * Thinking转换器 - 处理Claude与Gemini thinking配置转换
 * 仅保留必要的格式转换逻辑,不做内容分析
 */

import { ClaudeRequest, ClaudeThinking } from '../types/claude';

/**
 * Thinking配置接口
 */
export interface ThinkingConfig {
  thinkingBudget: number;
  includeThoughts?: boolean;
  exposeThoughtsToClient?: boolean;
  exposeToClient?: boolean;
}

/**
 * Thinking建议接口
 */
export interface ThinkingRecommendation {
  recommended: boolean;
  reason: string;
  suggestedBudget?: number;
  modelSupport: boolean;
}

export class ThinkingTransformer {
  static readonly defaultBudget = 2048;
  static readonly maxBudget = 32768;

  // 模型thinking限制配置
  private static readonly THINKING_LIMITS: Record<string, {
    min: number;
    max: number;
    default: number;
    canDisable: boolean;
  }> = {
    'gemini-2.5-pro': {
      min: 128,
      max: 12768,
      default: -1,
      canDisable: false
    },
    'gemini-2.5-flash': {
      min: 128,
      max: 6576,
      default: -1,
      canDisable: true
    },
    'gemini-2.5-flash-lite': {
      min: 512,
      max: 4576,
      default: -1,
      canDisable: true
    }
  };

  /**
   * 转换Claude thinking配置为Gemini格式
   */
  static transformThinking(
    claudeThinking: ClaudeThinking | undefined,
    geminiModel: string,
    claudeRequest: ClaudeRequest
  ): ThinkingConfig | null {
    // 2.0系列不支持thinking
    if (geminiModel.includes('2.0')) {
      return {
        thinkingBudget: 0,
        includeThoughts: false,
        exposeThoughtsToClient: false,
        exposeToClient: false
      };
    }

    const limits = this.THINKING_LIMITS[geminiModel];
    if (!limits) {
      return {
        thinkingBudget: 0,
        includeThoughts: false,
        exposeThoughtsToClient: false,
        exposeToClient: false
      };
    }

    // 如果明确指定了thinking配置
    if (claudeThinking) {
      if (claudeThinking.type === 'enabled') {
        let budget: number;
        if (claudeThinking.budget_tokens && claudeThinking.budget_tokens >= 1024) {
          budget = Math.min(claudeThinking.budget_tokens, limits.max);
          budget = Math.max(budget, limits.min);
        } else {
          budget = -1; // 动态预算
        }

        return {
          thinkingBudget: budget,
          includeThoughts: true,
          exposeThoughtsToClient: true,
          exposeToClient: true
        };
      } else if (claudeThinking.type === 'disabled') {
        if (!limits.canDisable) {
          return {
            thinkingBudget: limits.min,
            includeThoughts: false,
            exposeThoughtsToClient: false,
            exposeToClient: false
          };
        }
        return {
          thinkingBudget: 0,
          includeThoughts: false,
          exposeThoughtsToClient: false,
          exposeToClient: false
        };
      }
    }

    // 默认:使用动态预算,不暴露给客户端
    return {
      thinkingBudget: -1,
      includeThoughts: true,
      exposeThoughtsToClient: false,
      exposeToClient: false
    };
  }

  /**
   * 检查模型是否支持thinking
   */
  static modelSupportsThinking(geminiModel: string): boolean {
    if (geminiModel.includes('2.0')) {
      return false;
    }
    return !!this.THINKING_LIMITS[geminiModel];
  }

  /**
   * 创建thinking配置
   */
  static createThinkingConfig(
    enabled: boolean,
    budget?: number,
    exposeToClient: boolean = false,
    geminiModel?: string,
    maxTokens?: number
  ): ThinkingConfig | null {
    if (!enabled) {
      return {
        thinkingBudget: 0,
        includeThoughts: false,
        exposeThoughtsToClient: false,
        exposeToClient: false
      };
    }

    let finalBudget = budget || this.defaultBudget;

    if (geminiModel && maxTokens) {
      const result = this.validateAndAdjustBudget(finalBudget, maxTokens, geminiModel);
      finalBudget = result.budget;
    }

    return {
      thinkingBudget: finalBudget,
      includeThoughts: true,
      exposeThoughtsToClient: exposeToClient,
      exposeToClient: exposeToClient
    };
  }

  /**
   * 从响应中提取thinking内容
   */
  static extractThinkingFromResponse(response: any): {
    thoughts?: string;
    thoughtsTokenCount?: number;
  } | null {
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

    if (response.usageMetadata?.thoughtsTokenCount) {
      return {
        thoughtsTokenCount: response.usageMetadata.thoughtsTokenCount
      };
    }

    return null;
  }

  /**
   * 使用Gemini返回的原始签名
   * 签名用于维持多轮对话上下文,必须原样保留
   */
  static convertGeminiSignatureToClaudeFormat(
    geminiSignature?: string
  ): string {
    if (!geminiSignature) {
      console.warn('[ThinkingTransformer] No Gemini signature provided - this may break multi-turn context');
      return 'sig_missing';
    }

    // 直接返回Gemini的原始签名,不做任何转换
    return geminiSignature;
  }

  /**
   * 验证并调整thinking预算
   */
  static validateAndAdjustBudget(
    requestedBudget: number,
    maxTokens: number,
    geminiModel: string
  ): { budget: number; warnings: string[] } {
    const warnings: string[] = [];
    const limits = this.THINKING_LIMITS[geminiModel];

    if (!limits) {
      warnings.push(`Model ${geminiModel} does not support thinking`);
      return { budget: 0, warnings };
    }

    let adjustedBudget = requestedBudget;

    // Claude最小1024 tokens
    if (adjustedBudget > 0 && adjustedBudget < 1024) {
      adjustedBudget = 1024;
      warnings.push('Thinking budget adjusted to minimum 1024 tokens (Claude requirement)');
    }

    // 模型最大限制
    if (adjustedBudget > limits.max) {
      adjustedBudget = limits.max;
      warnings.push(`Thinking budget adjusted to model maximum ${limits.max} tokens`);
    }

    // 模型最小限制
    if (adjustedBudget > 0 && adjustedBudget < limits.min) {
      adjustedBudget = limits.min;
      warnings.push(`Thinking budget adjusted to model minimum ${limits.min} tokens`);
    }

    // thinking预算必须小于max_tokens
    if (adjustedBudget >= maxTokens) {
      adjustedBudget = Math.max(limits.min, maxTokens - 100);
      warnings.push('Thinking budget adjusted to be less than max_tokens (Claude requirement)');
    }

    // 检查是否尝试禁用不可禁用的模型
    if (adjustedBudget === 0 && !limits.canDisable) {
      adjustedBudget = limits.min;
      warnings.push(`Model ${geminiModel} cannot disable thinking, using minimum budget`);
    }

    return { budget: adjustedBudget, warnings };
  }

  /**
   * 验证thinking配置
   */
  static validateThinkingConfig(config: ThinkingConfig | null): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config) {
      return { isValid: true, errors, warnings };
    }

    if (config.thinkingBudget !== undefined) {
      if (typeof config.thinkingBudget !== 'number') {
        errors.push('thinkingBudget must be a number');
      } else {
        if (config.thinkingBudget < 50 && config.thinkingBudget !== 0) {
          warnings.push('thinkingBudget is very low, may not provide enough reasoning space');
        }
        if (config.thinkingBudget > this.maxBudget) {
          warnings.push(`thinkingBudget exceeds recommended maximum (${this.maxBudget})`);
        }
      }
    }

    if (config.exposeThoughtsToClient !== undefined && typeof config.exposeThoughtsToClient !== 'boolean') {
      errors.push('exposeThoughtsToClient must be a boolean');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 验证thinking签名(支持Gemini原始签名格式)
   */
  static validateThinkingSignature(signature: string): boolean {
    if (!signature) return false;
    // Gemini签名是base64格式,直接检查非空即可
    return signature.length > 0;
  }

  /**
   * 从签名中提取信息(保留用于兼容性)
   */
  static extractSignatureInfo(signature: string): {
    timestamp: number | null;
    contextId: string | null;
    turnNumber: number | null;
    hash: string | null;
  } {
    // Gemini签名是不透明的,无法提取信息
    return {
      timestamp: null,
      contextId: null,
      turnNumber: null,
      hash: null
    };
  }
}
