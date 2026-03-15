/**
 * Thinking转换器 - 处理Claude与Gemini thinking配置转换
 *
 * Gemini 3.1 引入 thinkingLevel 参数，取代了旧有的 token 预算模式
 * Claude 4.6 引入 adaptive 思考模式，通过 effort 控制思考强度
 */

import { ClaudeRequest, ClaudeThinking } from '../types/claude';

/**
 * Thinking级别类型
 */
export type ThinkingLevel = 'low' | 'medium' | 'high';

/**
 * Thinking配置接口
 */
export interface ThinkingConfig {
  thinkingLevel: ThinkingLevel;
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
  suggestedLevel?: ThinkingLevel;
  modelSupport: boolean;
}

export class ThinkingTransformer {
  // 模型thinking级别配置
  // 基于docs/README.md:
  // - 3.1 Pro：支持 high、medium、low，默认为 medium，无法关闭
  // - 3 Flash：支持 high、medium、low，默认为 medium，可以关闭
  // - 3.1 Flash-Lite：默认不思考，可通过设置 thinking_level 启用
  private static readonly THINKING_LEVELS: Record<string, {
    supported: ThinkingLevel[];
    default: ThinkingLevel;
    canDisable: boolean;
  }> = {
      'gemini-3.1-pro-preview': {
        supported: ['low', 'medium', 'high'],
        default: 'medium',
        canDisable: false
      },
      'gemini-3-flash-preview': {
        supported: ['low', 'medium', 'high'],
        default: 'medium',
        canDisable: true
      },
      'gemini-3.1-flash-lite-preview': {
        supported: ['low', 'medium', 'high'],
        default: 'low',
        canDisable: true
      }
    };

  /**
   * 转换Claude thinking配置为Gemini格式
   *
   * 核心逻辑：
   * 1. adaptive模式: 根据effort映射到thinkingLevel
   * 2. enabled模式(旧版): 根据budget_tokens推断级别
   * 3. disabled: 对于可禁用模型返回null，Pro模型用最低级别
   * 4. 未指定: 使用模型默认级别，不暴露思考内容
   */
  static transformThinking(
    claudeThinking: ClaudeThinking | undefined,
    geminiModel: string,
    claudeRequest: ClaudeRequest
  ): ThinkingConfig | null {
    const config = this.THINKING_LEVELS[geminiModel];
    if (!config) {
      // 不支持thinking的模型
      return null;
    }

    // 如果明确指定了thinking配置
    if (claudeThinking) {
      // adaptive模式（Claude 4.6推荐）
      if (claudeThinking.type === 'adaptive') {
        const level = this.mapEffortToLevel(claudeThinking.effort || 'high');
        return {
          thinkingLevel: level,
          includeThoughts: true,
          exposeThoughtsToClient: true,
          exposeToClient: true
        };
      }

      // enabled模式（旧版兼容）
      if (claudeThinking.type === 'enabled') {
        const level = this.mapBudgetToLevel(claudeThinking.budget_tokens);
        return {
          thinkingLevel: level,
          includeThoughts: true,
          exposeThoughtsToClient: true,
          exposeToClient: true
        };
      }

      // disabled模式
      if (claudeThinking.type === 'disabled') {
        if (config.canDisable) {
          // Flash模型可以禁用，不发送thinkingConfig
          return null;
        }
        // Pro模型无法禁用，用最低级别
        return {
          thinkingLevel: 'low',
          includeThoughts: false,
          exposeThoughtsToClient: false,
          exposeToClient: false
        };
      }
    }

    // 未指定thinking配置：使用模型默认级别，不暴露思考内容
    return {
      thinkingLevel: config.default,
      includeThoughts: false,
      exposeThoughtsToClient: false,
      exposeToClient: false
    };
  }

  /**
   * 将Claude的effort级别映射到Gemini的thinkingLevel
   */
  private static mapEffortToLevel(effort: string): ThinkingLevel {
    switch (effort) {
      case 'low': return 'low';
      case 'medium': return 'medium';
      case 'high': return 'high';
      case 'max': return 'high'; // max是Opus专属，映射到Gemini最高级别
      default: return 'medium';
    }
  }

  /**
   * 将旧版budget_tokens映射到thinkingLevel
   */
  private static mapBudgetToLevel(budgetTokens?: number): ThinkingLevel {
    if (!budgetTokens) return 'medium';
    if (budgetTokens < 4000) return 'low';
    if (budgetTokens <= 10000) return 'medium';
    return 'high';
  }

  /**
   * 检查模型是否支持thinking
   */
  static modelSupportsThinking(geminiModel: string): boolean {
    return !!this.THINKING_LEVELS[geminiModel];
  }

  /**
   * 创建thinking配置
   */
  static createThinkingConfig(
    enabled: boolean,
    level?: ThinkingLevel,
    exposeToClient: boolean = false
  ): ThinkingConfig | null {
    if (!enabled) {
      return null;
    }

    return {
      thinkingLevel: level || 'medium',
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
   * 注意: 第一个thinking chunk通常没有signature,只有最后的chunk才有thoughtSignature
   */
  static convertGeminiSignatureToClaudeFormat(
    geminiSignature?: string
  ): string | undefined {
    if (!geminiSignature) {
      return undefined;
    }
    // 直接返回Gemini的原始签名,不做任何转换
    return geminiSignature;
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

    if (config.thinkingLevel !== undefined) {
      const validLevels: ThinkingLevel[] = ['low', 'medium', 'high'];
      if (!validLevels.includes(config.thinkingLevel)) {
        errors.push(`thinkingLevel must be one of: ${validLevels.join(', ')}`);
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
   * 判断模型在当前配置下是否会返回signature
   * @param geminiModel Gemini模型名称
   * @param thinkingLevel thinking级别（null表示未配置）
   * @returns true表示会返回signature，false表示不会
   */
  static willReturnSignature(geminiModel: string, thinkingLevel: ThinkingLevel | null): boolean {
    const config = this.THINKING_LEVELS[geminiModel];
    if (!config) return false;

    // Pro模型无法禁用thinking，始终返回signature
    if (!config.canDisable) return true;

    // Flash模型：如果有配置thinkingLevel则会返回signature
    return thinkingLevel !== null;
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
