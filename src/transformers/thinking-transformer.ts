/**
 * Thinking转换器 - 正确处理Claude Extended Thinking与Gemini thinkingConfig的转换
 * 基于BAK目录Node.js版本源码以及DOCS目录官方接口文档
 */

import { ClaudeRequest, ClaudeThinking } from '../types/claude';

export interface ThinkingConfig {
  thinkingBudget: number;
  includeThoughts?: boolean;
  exposeThoughtsToClient?: boolean;
  exposeToClient?: boolean;  // 兼容性字段，用于向后兼容
}

export interface ThinkingRecommendation {
  recommended: boolean;
  reason: string;
  suggestedBudget?: number;
  modelSupport: boolean;
}

export interface ComplexityAnalysis {
  score: number;
  factors: {
    messageLength: number;
    toolCount: number;
    hasComplexContent: boolean;
    hasMultipleRoles: boolean;
    requiresReasoning: boolean;
  };
  recommendation: 'enable' | 'disable' | 'auto';
}

export class ThinkingTransformer {
  // 默认思考预算
  static readonly defaultBudget = 2048;

  // 最大思考预算
  static readonly maxBudget = 32768;

  // 基于官方文档的模型thinking限制配置 (docs/README.md:82-134行)
  private static readonly THINKING_LIMITS: Record<string, {
    min: number;
    max: number;
    default: number;
    canDisable: boolean;
  }> = {
    'gemini-2.5-pro': {
      min: 128,
      max: 32768,
      default: -1, // 动态预算
      canDisable: false
    },
    'gemini-2.5-flash': {
      min: 0,
      max: 24576,
      default: -1, // 动态预算
      canDisable: true
    },
    'gemini-2.5-flash-lite': {
      min: 512,
      max: 24576,
      default: 0, // 默认关闭
      canDisable: true
    }
    // 注意: gemini-2.0系列不支持thinking功能
  };

  // 复杂度阈值
  private static readonly complexityThresholds = {
    low: 10,
    medium: 25,
    high: 50
  };

  /**
   * 转换Claude thinking配置为Gemini格式 (增强版本)
   * 正确处理Claude Extended Thinking与Gemini thinkingConfig的转换
   */
  static transformThinking(
    claudeThinking: ClaudeThinking | undefined,
    geminiModel: string,
    claudeRequest: ClaudeRequest
  ): ThinkingConfig | null {
    // 获取模型限制
    const limits = this.THINKING_LIMITS[geminiModel];
    if (!limits) {
      return null; // 模型不支持thinking
    }

    // 如果明确指定了thinking配置
    if (claudeThinking) {
      if (claudeThinking.type === 'enabled') {
        let budget = claudeThinking.budget_tokens || this.calculateOptimalBudget(claudeRequest, geminiModel);

        // 根据模型限制调整预算
        if (budget > 0) {
          budget = Math.max(limits.min, Math.min(budget, limits.max));
        } else {
          budget = limits.default;
        }

        return {
          thinkingBudget: budget,
          includeThoughts: true,
          exposeThoughtsToClient: true,  // 恢复：客户端启用thinking时应该暴露
          exposeToClient: true  // 兼容性字段
        };
      } else if (claudeThinking.type === 'disabled') {
        if (!limits.canDisable) {
          // 模型不允许禁用thinking，使用最小值
          return {
            thinkingBudget: limits.min,
            includeThoughts: false,
            exposeThoughtsToClient: false,
            exposeToClient: false  // 兼容性字段
          };
        }
        return {
          thinkingBudget: 0,
          includeThoughts: false,
          exposeThoughtsToClient: false,
          exposeToClient: false  // 兼容性字段
        };
      }
    }

    // 自动判断是否启用thinking (基于复杂度和模型默认)
    const complexity = this.analyzeComplexity(claudeRequest);
    let budget = limits.default;

    console.log(`[ThinkingDebug] Auto-thinking analysis for model ${geminiModel}:`, {
      complexity: complexity.score,
      recommendation: complexity.recommendation,
      defaultBudget: limits.default,
      canDisable: limits.canDisable,
      requiresReasoning: complexity.factors.requiresReasoning
    });

    if (budget === -1) {
      // 动态预算，基于复杂度计算
      budget = this.calculateOptimalBudget(claudeRequest, geminiModel);
      console.log(`[ThinkingDebug] Dynamic budget calculated: ${budget}`);
    } else if (budget === 0 && complexity.recommendation === 'enable') {
      // 默认关闭但建议开启的情况
      budget = this.calculateOptimalBudget(claudeRequest, geminiModel);
      console.log(`[ThinkingDebug] Auto-enabled thinking due to complexity: ${budget}`);
    }

    // 关键：对于Gemini 2.5 Pro，即使自动启用thinking，也不应该暴露给客户端
    const shouldExposeToClient = false; // 只有显式启用才暴露

    console.log(`[ThinkingDebug] Final auto-thinking config:`, {
      thinkingBudget: budget,
      includeThoughts: budget > 0,
      exposeToClient: shouldExposeToClient,
      reason: 'Auto-mode: never expose thinking to client unless explicitly enabled'
    });

    return {
      thinkingBudget: budget,
      includeThoughts: budget > 0,
      exposeThoughtsToClient: shouldExposeToClient,  // 自动模式下不暴露
      exposeToClient: shouldExposeToClient  // 兼容性字段
    };
  }

  /**
   * 获取thinking配置建议
   */
  static getThinkingRecommendation(claudeRequest: ClaudeRequest, geminiModel: string): {
    recommended: boolean;
    reason: string;
    estimatedBudget: number;
    complexity: ComplexityAnalysis;
  } {
    const complexity = this.analyzeComplexity(claudeRequest);
    const estimatedBudget = this.calculateOptimalBudget(claudeRequest, geminiModel);
    const modelSupports = this.modelSupportsThinking(geminiModel);

    let recommended = false;
    let reason = '';

    if (!modelSupports) {
      reason = `模型 ${geminiModel} 不支持thinking功能`;
    } else if (complexity.recommendation === 'enable') {
      recommended = true;
      reason = `请求复杂度较高 (${complexity.score}分)，建议启用thinking`;
    } else if (complexity.recommendation === 'auto') {
      recommended = complexity.score > this.complexityThresholds.medium;
      reason = `请求复杂度中等 (${complexity.score}分)，${recommended ? '建议' : '可选择'}启用thinking`;
    } else {
      reason = `请求复杂度较低 (${complexity.score}分)，不建议启用thinking`;
    }

    return {
      recommended,
      reason,
      estimatedBudget,
      complexity
    };
  }

  /**
   * 计算最优thinking预算 (基于任务复杂度)
   */
  private static calculateOptimalBudget(claudeRequest: ClaudeRequest, geminiModel: string): number {
    const limits = this.THINKING_LIMITS[geminiModel];
    if (!limits) return 0;

    const complexity = this.analyzeComplexity(claudeRequest);

    // 根据复杂度分数计算预算
    let budgetRatio = 0;

    if (complexity.score >= this.complexityThresholds.high) {
      budgetRatio = 0.8; // 使用80%的最大预算
    } else if (complexity.score >= this.complexityThresholds.medium) {
      budgetRatio = 0.5; // 使用50%的最大预算
    } else if (complexity.score >= this.complexityThresholds.low) {
      budgetRatio = 0.3; // 使用30%的最大预算
    } else {
      return limits.canDisable ? 0 : limits.min;
    }

    const calculatedBudget = Math.round(limits.max * budgetRatio);
    return Math.max(limits.min, Math.min(calculatedBudget, limits.max));
  }

  /**
   * 分析请求复杂度 (优化版本)
   */
  static analyzeComplexity(claudeRequest: ClaudeRequest): ComplexityAnalysis {
    let score = 0;
    const factors = {
      messageLength: 0,
      toolCount: 0,
      hasComplexContent: false,
      hasMultipleRoles: false,
      requiresReasoning: false
    };

    // 分析消息长度和内容
    let totalTextLength = 0;
    const roles = new Set<string>();
    let hasToolUse = false;
    let hasComplexContent = false;

    claudeRequest.messages.forEach(message => {
      roles.add(message.role);

      if (typeof message.content === 'string') {
        totalTextLength += message.content.length;
        if (this.containsComplexPatterns(message.content)) {
          hasComplexContent = true;
        }
      } else {
        message.content.forEach(block => {
          if (block.type === 'text' && block.text) {
            totalTextLength += block.text.length;
            if (this.containsComplexPatterns(block.text)) {
              hasComplexContent = true;
            }
          }
          // 注意：ClaudeContent类型不包含tool_use和tool_result
          // 这些类型存在于响应内容中，而不是请求内容中
        });
      }
    });

    factors.messageLength = totalTextLength;
    factors.hasMultipleRoles = roles.size > 1;
    factors.hasComplexContent = hasComplexContent;

    // 分析工具使用
    factors.toolCount = claudeRequest.tools ? claudeRequest.tools.length : 0;
    // 工具使用的判断基于tools定义而不是消息内容
    if (factors.toolCount > 0) {
      hasToolUse = true;
    }

    // 分析是否需要推理
    factors.requiresReasoning = this.requiresReasoning(claudeRequest);

    // 计算复杂度分数
    score += Math.min(totalTextLength / 500, 20); // 文本长度贡献
    score += factors.toolCount * 3; // 工具数量贡献
    score += factors.hasComplexContent ? 10 : 0;
    score += factors.hasMultipleRoles ? 5 : 0;
    score += factors.requiresReasoning ? 15 : 0;

    // 添加系统提示复杂度
    if (claudeRequest.system) {
      const systemText = typeof claudeRequest.system === 'string' ?
        claudeRequest.system :
        claudeRequest.system.map(b => b.text || '').join(' ');
      score += Math.min(systemText.length / 200, 10);
    }

    // 确定推荐
    let recommendation: 'enable' | 'disable' | 'auto' = 'disable';
    if (score > this.complexityThresholds.high) {
      recommendation = 'enable';
    } else if (score > this.complexityThresholds.low) {
      recommendation = 'auto';
    }

    return {
      score: Math.round(score),
      factors,
      recommendation
    };
  }

  /**
   * 检测文本中的复杂模式
   */
  private static containsComplexPatterns(text: string): boolean {
    const complexPatterns = [
      /analyze|analysis|reasoning|因为|所以|however|therefore/i,
      /step\s*by\s*step|逐步|分步/i,
      /compare|contrast|difference|相比|对比/i,
      /explain|elaborate|详细|解释/i,
      /solve|solution|problem|解决|问题|方案/i,
      /calculate|computation|计算|求解/i,
      /logic|logical|逻辑|推理/i,
      /strategy|approach|方法|策略/i
    ];

    return complexPatterns.some(pattern => pattern.test(text));
  }

  /**
   * 判断请求是否需要推理
   */
  private static requiresReasoning(claudeRequest: ClaudeRequest): boolean {
    // 检查是否有数学计算
    const hasMathContent = this.hasMathematicalContent(claudeRequest);

    // 检查是否有编程任务
    const hasCodingContent = this.hasCodingContent(claudeRequest);

    // 检查是否有分析任务
    const hasAnalysisContent = this.hasAnalysisContent(claudeRequest);

    // 检查是否有多步推理
    const hasMultiStepReasoning = this.hasMultiStepReasoning(claudeRequest);

    return hasMathContent || hasCodingContent || hasAnalysisContent || hasMultiStepReasoning;
  }

  /**
   * 检测数学内容
   */
  private static hasMathematicalContent(claudeRequest: ClaudeRequest): boolean {
    const mathKeywords = /\b(calculate|solve|equation|formula|derivative|integral|probability|statistics|数学|计算|公式|方程|统计|概率)\b/i;
    const mathSymbols = /[+\-*/=<>≤≥∑∫∂√π]/;

    return this.searchInRequest(claudeRequest, (text) =>
      mathKeywords.test(text) || mathSymbols.test(text)
    );
  }

  /**
   * 检测编程内容
   */
  private static hasCodingContent(claudeRequest: ClaudeRequest): boolean {
    const codeKeywords = /\b(function|class|import|return|if|else|for|while|def|var|let|const|编程|代码|函数|类|变量)\b/i;
    const codePatterns = /```|`[^`]+`|<\/\?\w+>|\{[\s\S]*\}/;

    return this.searchInRequest(claudeRequest, (text) =>
      codeKeywords.test(text) || codePatterns.test(text)
    );
  }

  /**
   * 检测分析内容
   */
  private static hasAnalysisContent(claudeRequest: ClaudeRequest): boolean {
    const analysisKeywords = /\b(analyze|analysis|evaluate|assessment|review|critique|compare|summarize|分析|评估|总结|对比|评价)\b/i;

    return this.searchInRequest(claudeRequest, (text) =>
      analysisKeywords.test(text)
    );
  }

  /**
   * 检测多步推理
   */
  private static hasMultiStepReasoning(claudeRequest: ClaudeRequest): boolean {
    const multiStepKeywords = /\b(step|stage|phase|first|second|then|next|finally|步骤|阶段|首先|然后|接下来|最后)\b/i;
    const reasoningKeywords = /\b(because|since|therefore|thus|hence|given|assuming|因为|由于|所以|因此|假设|鉴于)\b/i;

    return this.searchInRequest(claudeRequest, (text) =>
      multiStepKeywords.test(text) && reasoningKeywords.test(text)
    );
  }

  /**
   * 在请求中搜索匹配条件的内容
   */
  private static searchInRequest(claudeRequest: ClaudeRequest, predicate: (text: string) => boolean): boolean {
    // 检查系统提示
    if (claudeRequest.system) {
      const systemText = typeof claudeRequest.system === 'string' ?
        claudeRequest.system :
        claudeRequest.system.map(b => b.text || '').join(' ');
      if (predicate(systemText)) return true;
    }

    // 检查消息
    for (const message of claudeRequest.messages) {
      if (typeof message.content === 'string') {
        if (predicate(message.content)) return true;
      } else {
        for (const block of message.content) {
          if (block.type === 'text' && block.text && predicate(block.text)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * 检查模型是否支持thinking (基于官方文档)
   */
  static modelSupportsThinking(geminiModel: string): boolean {
    return !!this.THINKING_LIMITS[geminiModel];
  }

  /**
   * 创建思考配置模板 (符合Gemini API格式)
   */
  static createThinkingConfig(
    enabled: boolean,
    budget?: number,
    exposeToClient: boolean = false  // 默认不暴露给客户端
  ): ThinkingConfig | null {
    if (!enabled) {
      return {
        thinkingBudget: 0 // 设为0禁用thinking
      };
    }

    return {
      thinkingBudget: budget || this.defaultBudget,
      exposeThoughtsToClient: exposeToClient
    };
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
   * 从思考内容中分离对话回复
   * 作为代理服务，只根据Gemini的返回格式进行转换，不做复杂的内容判断
   */
  static separateThinkingAndResponse(thinkingText: string): {
    thinking: string;
    response: string;
  } {
    // 简化逻辑：对于Gemini标记为thought的内容，默认保持为thinking
    // 只在有明确分隔符的情况下才分离

    const explicitSeparators = [
      /\n\n---+\s*(?:RESPONSE|FINAL RESPONSE|回复|最终回复)\s*---+\s*\n\n/i,
      /\n\n##\s*(?:Response|Final Response|回复|最终回复)\s*\n\n/i
    ];

    for (const separator of explicitSeparators) {
      const match = thinkingText.match(separator);
      if (match && match.index) {
        const thinking = thinkingText.substring(0, match.index).trim();
        const response = thinkingText.substring(match.index + match[0].length).trim();

        if (thinking && response) {
          return { thinking, response };
        }
      }
    }

    // 默认情况：标记为thought的内容保持为thinking
    return {
      thinking: thinkingText,
      response: ''
    };
  }

  /**
   * 判断文本是否是简单的回复内容
   */
  private static isSimpleResponse(text: string): boolean {
    // 去除首尾空白
    const trimmed = text.trim();

    // 检查是否包含明确的回复标记
    const responseIndicators = [
      /^(?:Here's|这里是|以下是)/i,
      /^(?:To answer|回答|为了回答)/i,
      /^(?:I'll|我将|我会)/i,
      /^(?:Let me|让我)/i,
      /^(?:Based on|基于)/i,
      /^(?:After|经过)/i
    ];

    // 如果以回复标记开始，很可能是回复
    const startsWithResponse = responseIndicators.some(pattern => pattern.test(trimmed));

    // 检查是否不包含明确的思考过程标记
    const noThinkingMarkers = !this.containsThinkingPatterns(trimmed);

    // 检查是否是较短的陈述性内容
    const isShortStatement = trimmed.length < 300;

    // 检查是否包含完整的句子结构
    const hasCompleteSentences = /[.。!！?？]/.test(trimmed);

    return (startsWithResponse || (noThinkingMarkers && isShortStatement && hasCompleteSentences));
  }
  private static isThinkingParagraph(paragraph: string): boolean {
    const thinkingIndicators = [
      /(?:let me|让我|我需要|我应该|我来)/i,
      /(?:think|consider|analyze|思考|考虑|分析)/i,
      /(?:first|second|then|next|首先|然后|接下来)/i,
      /(?:what|how|why|什么|如何|为什么|怎么)/i,
      /(?:step|阶段|步骤)/i,
      /(?:hmm|嗯|好的|看起来)/i
    ];

    return thinkingIndicators.some(pattern => pattern.test(paragraph));
  }

  /**
   * 判断段落是否是明确的回复内容
   */
  private static isDefinitiveResponse(paragraph: string): boolean {
    const responseIndicators = [
      /(?:I'll|我将|我会)/i,
      /(?:Here's|这里是|以下是)/i,
      /(?:To answer|回答|解答)/i,
      /(?:The solution|解决方案|方案)/i,
      /(?:In summary|总结|概括)/i,
      /(?:My recommendation|我的建议|建议)/i,
      /(?:Therefore|因此|所以)/i
    ];

    // 检查是否包含明确的回复指示词
    const hasResponseIndicators = responseIndicators.some(pattern => pattern.test(paragraph));

    // 检查是否以明确的陈述句开始（而不是思考过程）
    const startsWithStatement = /^[A-Z][^?]*\.$/.test(paragraph.trim()) ||
                               /^[一-龥][^？]*。$/.test(paragraph.trim());

    return hasResponseIndicators || startsWithStatement;
  }

  /**
   * 检查文本是否包含思考过程的模式
   */
  private static containsThinkingPatterns(text: string): boolean {
    const thinkingPatterns = [
      /(?:I'm|I am|我正在|我在)/i,
      /(?:let me|让我|我需要|我应该)/i,
      /(?:thinking|considering|analyzing|思考|考虑|分析)/i,
      /(?:step|phase|stage|步骤|阶段|阶段)/i,
      /(?:first|second|next|then|首先|然后|接下来)/i,
      /(?:planning|策划|计划)/i,
      /(?:approach|方法|策略)/i,
      /(?:breaking down|分解|拆分)/i,
      /(?:focusing|专注|关注)/i,
      /(?:examining|检查|查看)/i,
      /(?:evaluating|评估|评价)/i,
      /(?:identifying|识别|确定)/i,
      /(?:prioritizing|优先考虑)/i
    ];

    return thinkingPatterns.some(pattern => pattern.test(text));
  }

  /**
   * 判断整个文本是否是完整的回复（不包含思考过程）
   */
  private static isCompleteResponse(text: string): boolean {
    // 检查是否包含明确的回复开始标记
    const responseStarters = [
      /^(?:Here's|这里是|以下是)/i,
      /^(?:To answer|回答)/i,
      /^(?:The answer is|答案是)/i,
      /^(?:Based on|基于)/i,
      /^(?:After analyzing|分析后)/i,
      /^(?:I'll|我将|我会)/i,
      /^(?:Let me provide|让我提供)/i
    ];

    // 检查文本是否以回复标记开始
    const startsWithResponse = responseStarters.some(pattern => pattern.test(text.trim()));

    // 检查文本是否不包含思考过程指示词
    const hasNoThinkingProcess = !this.containsThinkingPatterns(text);

    // 检查是否是简短的陈述性回复
    const isShortStatement = text.length < 150 && !text.includes('？') && !text.includes('?');

    return startsWithResponse || (hasNoThinkingProcess && isShortStatement);
  }
  static validateThinkingConfig(config: ThinkingConfig | null): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config) {
      return { isValid: true, errors, warnings }; // null配置是有效的
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