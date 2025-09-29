/**
 * Thinking转换器 - 正确处理Claude Extended Thinking与Gemini thinkingConfig的转换
 * 基于BAK目录Node.js版本源码以及DOCS目录官方接口文档
 */

import { ClaudeRequest, ClaudeThinking } from '../types/claude';

/**
 * Thinking配置接口
 * 基于官方文档优化：同时支持Claude和Gemini的thinking参数
 */
export interface ThinkingConfig {
  /** 思考预算（token数量）
   * -1: 动态预算（Gemini自动调整）
   * 0: 禁用thinking
   * >0: 固定预算
   */
  thinkingBudget: number;
  /** 是否在响应中包含思考内容 */
  includeThoughts?: boolean;
  /** 是否向客户端暴露思考内容（Claude兼容） */
  exposeThoughtsToClient?: boolean;
  /** 向客户端暴露（向后兼容字段） */
  exposeToClient?: boolean;
}

/**
 * Thinking建议接口
 * 增强版本，包含更多上下文信息
 */
export interface ThinkingRecommendation {
  recommended: boolean;
  reason: string;
  suggestedBudget?: number;
  modelSupport: boolean;
  /** 复杂度分析结果 */
  complexity?: ComplexityAnalysis;
  /** 预算调整建议 */
  budgetAdjustment?: {
    original: number;
    suggested: number;
    reason: string;
  };
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
      default: -1, // 固定使用动态预算
      canDisable: false
    },
    'gemini-2.5-flash': {
      min: 0,
      max: 24576,
      default: -1, // 统一使用动态预算
      canDisable: true
    },
    'gemini-2.5-flash-lite': {
      min: 512,
      max: 24576,
      default: -1, // 统一使用动态预算
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
   * 检测是否需要使用工具调用模板解决方案
   */
  static needsToolCallTemplate(
    claudeRequest: ClaudeRequest,
    geminiModel: string,
    hasTools: boolean = false
  ): boolean {
    // 禁用非流式请求的模板模式，因为它会导致 MALFORMED_FUNCTION_CALL
    // 只对 FLASH 模型 + thinking + tools + 流式 的组合使用模板
    const isFlashModel = geminiModel.includes('2.5-flash');
    const hasThinking = claudeRequest.thinking?.type === 'enabled';
    const isStream = claudeRequest.stream === true;

    return isFlashModel && hasThinking && hasTools && isStream;
  }

  /**
   * 从模板响应中提取工具调用（增强版）
   */
  static extractToolCallsFromTemplate(text: string): Array<{ name: string; arguments: any }> | null {
    if (!text) return null;

    // 多种模板格式支持
    const patterns = [
      /<TOOL_CALLS>\s*(\[[\s\S]*?\])\s*<\/TOOL_CALLS>/,
      /```json\s*(\[[\s\S]*?\])\s*```/,
      /TOOL_CALLS:\s*(\[[\s\S]*?\])/,
      // 兜底模式：查找任何看起来像工具调用的JSON数组
      /\[\s*\{\s*"name":\s*"[^"]+"\s*,\s*"arguments":\s*\{[\s\S]*?\}\s*\}\s*\]/
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        try {
          const toolCalls = JSON.parse(match[1] || match[0]);
          if (Array.isArray(toolCalls)) {
            const validCalls = toolCalls.filter(call => call && call.name);
            if (validCalls.length > 0) {
              // Logger.info('ThinkingTransformer', 'Successfully extracted tool calls from template', {
              //   pattern: pattern.source,
              //   callsCount: validCalls.length,
              //   calls: validCalls.map(c => ({ name: c.name, hasArgs: !!c.arguments }))
              // });
              return validCalls;
            }
          }
        } catch (error) {
          // Logger.debug('ThinkingTransformer', 'Failed to parse tool calls with pattern', {
          //   pattern: pattern.source,
          //   error: error instanceof Error ? error.message : String(error),
          //   match: match[1] || match[0]
          // });
          continue;
        }
      }
    }

    // 最后尝试查找单个工具调用
    const singleCallPattern = /"name":\s*"([^"]+)"\s*,\s*"arguments":\s*(\{[^}]*\})/g;
    const singleMatches = [];
    let singleMatch;

    while ((singleMatch = singleCallPattern.exec(text)) !== null) {
      try {
        const args = JSON.parse(singleMatch[2]);
        singleMatches.push({
          name: singleMatch[1],
          arguments: args
        });
      } catch (e) {
        continue;
      }
    }

    if (singleMatches.length > 0) {
      // Logger.info('ThinkingTransformer', 'Extracted individual tool calls', {
      //   callsCount: singleMatches.length
      // });
      return singleMatches;
    }

    return null;
  }

  /**
   * 清理响应文本，移除工具调用模板标记（增强版）
   */
  static cleanResponseText(text: string): string {
    if (!text) return text;

    // 移除各种格式的工具调用标记
    const patterns = [
      /<TOOL_CALLS>\s*\[[\s\S]*?\]\s*<\/TOOL_CALLS>/g,
      /```json\s*\[[\s\S]*?\]\s*```/g,
      /TOOL_CALLS:\s*\[[\s\S]*?\]/g
    ];

    let cleanedText = text;
    for (const pattern of patterns) {
      cleanedText = cleanedText.replace(pattern, '');
    }

    // 清理多余的空行
    cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n').trim();

    return cleanedText;
  }

  /**
   * 生成工具调用模板的系统指令
   */
  static generateToolCallTemplateInstruction(claudeRequest: ClaudeRequest): string {
    if (!claudeRequest.tools || claudeRequest.tools.length === 0) {
      return '';
    }

    const excludedTools = ['MultiEdit', 'NotebookEdit', 'SlashCommand'];
    const coreTools = claudeRequest.tools
      .filter(tool => !excludedTools.includes(tool.name))
      .map(tool => tool.name);
    const availableTools = coreTools.join(', ');

    return `
CRITICAL RESPONSE FORMAT REQUIREMENTS:

1. ALWAYS provide a conversational response text FIRST before calling any tools
2. Your response must follow this order:
   a) Normal conversational text explaining your approach or findings
   b) Then, if needed, call tools using the standard function_call format

3. When calling tools:
   - Use the standard function_call format provided by Gemini
   - Call tools one at a time when possible
   - Available core tools: ${availableTools}

4. Do NOT use template formats like <TOOL_CALLS> or JSON arrays
5. Do NOT skip the conversational response text - it is REQUIRED

Example correct response structure:
- First: "I'll analyze the code and create a task list to track progress."
- Then: [function_call to TodoWrite tool]

Use the native function calling mechanism only.`.trim();
  }

  /**
   * 转换Claude thinking配置为Gemini格式
   * 基于官方文档优化：Claude Extended Thinking与Gemini thinkingConfig的正确转换
   *
   * 官方文档要点：
   * - Claude: 最小1024 tokens预算，使用budget_tokens字段
   * - Gemini: 支持动态thinking (-1)，各模型有不同范围
   * - 思考签名需要正确维护以支持多轮对话上下文
   */
  static transformThinking(
    claudeThinking: ClaudeThinking | undefined,
    geminiModel: string,
    claudeRequest: ClaudeRequest,
    hasTools: boolean = false
  ): ThinkingConfig | null {
    // 检查是否是2.0系列模型，它们不支持thinking
    if (geminiModel.includes('2.0') || geminiModel.includes('exp-1206')) {
      // 2.0系列和实验模型不支持thinking，必须禁用以防止接口报错
      return {
        thinkingBudget: 0,  // 禁用thinking
        includeThoughts: false,
        exposeThoughtsToClient: false,
        exposeToClient: false
      };
    }

    // 获取模型限制
    const limits = this.THINKING_LIMITS[geminiModel];
    if (!limits) {
      // 未知模型，默认禁用thinking
      return {
        thinkingBudget: 0,
        includeThoughts: false,
        exposeThoughtsToClient: false,
        exposeToClient: false
      };
    }

    // 检测问题组合：FLASH + thinking + tools + 流式 容易导致只输出thinking不执行工具
    const isFlashModel = geminiModel.includes('2.5-flash');
    const isStream = claudeRequest.stream === true;
    const hasThinking = claudeRequest.thinking?.type === 'enabled' || !claudeThinking;

    // CRITICAL FIX: FLASH模型的非流式请求 + thinking + tools 会导致MALFORMED_FUNCTION_CALL
    // 对于这种组合，完全禁用thinking来避免错误
    if (isFlashModel && !isStream && hasTools && hasThinking) {
      // Logger.info('ThinkingTransformer', 'Detected problematic combination: FLASH + non-stream + thinking + tools - DISABLING thinking', {
      //   model: geminiModel,
      //   hasTools,
      //   isStream,
      //   thinking: claudeRequest.thinking?.type
      // });

      return {
        thinkingBudget: 0,  // 完全禁用thinking
        includeThoughts: false,
        exposeThoughtsToClient: false,
        exposeToClient: false
      };
    }

    if (isFlashModel && hasThinking && hasTools && isStream) {
      // Logger.info('ThinkingTransformer', 'Detected problematic combination: FLASH + thinking + tools + stream', {
      //   model: geminiModel,
      //   hasTools,
      //   isStream,
      //   thinking: claudeRequest.thinking?.type
      // });

      // 对于流式请求，降低thinking预算避免"思考陷阱"
      return {
        thinkingBudget: 512,  // 使用较低的固定预算
        includeThoughts: true,
        exposeThoughtsToClient: claudeRequest.thinking?.type === 'enabled',
        exposeToClient: claudeRequest.thinking?.type === 'enabled'
      };
    }

    // 如果明确指定了thinking配置
    if (claudeThinking) {
      if (claudeThinking.type === 'enabled') {
        // 根据官方文档，优先使用Claude指定的budget_tokens
        let budget: number;
        if (claudeThinking.budget_tokens && claudeThinking.budget_tokens >= 1024) {
          // Claude官方要求最小1024 tokens，确保预算符合Gemini模型限制
          budget = Math.min(claudeThinking.budget_tokens, limits.max);
          budget = Math.max(budget, limits.min);
        } else {
          // 未指定预算或预算过小时，使用动态预算
          budget = -1;
        }

        return {
          thinkingBudget: budget,
          includeThoughts: true,
          exposeThoughtsToClient: true,  // 客户端启用thinking时应该暴露
          exposeToClient: true  // 兼容性字段
        };
      } else if (claudeThinking.type === 'disabled') {
        if (!limits.canDisable) {
          // 模型不允许禁用thinking，使用最小值
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

    // 默认情况：客户端未明确启用thinking
    // 根据官方文档建议，对于中等复杂度任务使用适中的预算
    const complexity = this.analyzeComplexity(claudeRequest);
    const defaultBudget = complexity.score > this.complexityThresholds.medium ?
      Math.min(2048, limits.max) : Math.min(512, limits.max);

    return {
      thinkingBudget: Math.max(defaultBudget, limits.min),
      includeThoughts: true,  // 启用thinking以提升响应质量
      exposeThoughtsToClient: false,  // 不暴露给客户端
      exposeToClient: false  // 兼容性字段
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
        Array.isArray(claudeRequest.system) ? claudeRequest.system.map(b => b.text || '').join(' ') : '';
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
        Array.isArray(claudeRequest.system) ? claudeRequest.system.map(b => b.text || '').join(' ') : '';
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
    // 2.0系列和实验模型不支持thinking
    if (geminiModel.includes('2.0') || geminiModel.includes('exp-1206')) {
      return false;
    }
    return !!this.THINKING_LIMITS[geminiModel];
  }

  /**
   * 创建思考配置模板
   * 基于官方文档要求，确保配置符合Gemini API格式
   *
   * 官方要点：
   * - 支持动态thinking (-1)
   * - 正确设置exposeThoughtsToClient
   * - 考虑模型兼容性
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
    let warnings: string[] = [];

    // 如果提供了模型信息，进行预算验证
    if (geminiModel && maxTokens) {
      const result = this.validateAndAdjustBudget(finalBudget, maxTokens, geminiModel);
      finalBudget = result.budget;
      warnings = result.warnings;
    }

    const config: ThinkingConfig = {
      thinkingBudget: finalBudget,
      includeThoughts: true,
      exposeThoughtsToClient: exposeToClient,
      exposeToClient: exposeToClient
    };

    // 记录警告信息（在实际应用中可能需要日志记录）
    if (warnings.length > 0) {
      // console.warn('ThinkingConfig warnings:', warnings);
    }

    return config;
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
   * 生成thinking签名
   * 基于官方文档要求：用于标识和追踪thinking内容，支持多轮对话上下文维护
   *
   * 官方文档要点：
   * - 签名用于维持多轮交互中的上下文
   * - 不要将带签名的部分连接在一起
   * - 需要返回完整的前一响应和签名
   */
  static generateThinkingSignature(
    thinkingContent: string,
    contextId?: string,
    turnNumber?: number
  ): string {
    const timestamp = Date.now().toString(36);
    const hash = this.simpleHash(thinkingContent);
    const context = contextId ? `_ctx${contextId.substring(0, 8)}` : '';
    const turn = turnNumber ? `_t${turnNumber}` : '';
    return `sig_${hash}_${timestamp}${context}${turn}`;
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
   * 处理thinking内容块
   * 基于官方文档：正确处理思考内容的签名和暴露逻辑
   *
   * 官方要点：
   * - Claude 4 模型返回摘要化的thinking输出
   * - 使用工具时，必须传回完整、未修改的thinking块
   * - 思考块会自动从上下文中移除（前一轮）
   */
  static processThinkingContent(
    thinkingText: string,
    exposeToClient: boolean,
    contextId?: string,
    turnNumber?: number,
    isStreamingResponse: boolean = false
  ): any | null {
    if (!thinkingText) return null;

    const signature = this.generateThinkingSignature(thinkingText, contextId, turnNumber);

    // 根据官方文档，只在exposeToClient为true时返回thinking内容
    if (!exposeToClient) {
      // 即使不暴露给客户端，也要保留签名用于内部追踪
      return {
        type: 'thinking',
        thinking: '', // 不暴露内容
        signature,
        internal: true // 标记为内部使用
      };
    }

    return {
      type: 'thinking',
      thinking: thinkingText,
      signature,
      streaming: isStreamingResponse
    };
  }

  /**
   * 从思考内容中分离对话回复
   * 作为代理服务，只根据Gemini的返回格式进行转换，不做复杂的内容判断
   * 注意：Flash模型和Pro模型的thinking格式可能不同
   */
  static separateThinkingAndResponse(thinkingText: string, modelType?: string): {
    thinking: string;
    response: string;
  } {
    // Flash/Sonnet模型不应该尝试分离，因为它们的thinking格式不同
    if (modelType && (modelType.includes('flash') || modelType.includes('sonnet'))) {
      // Flash模型：整个内容都是thinking，不分离
      return {
        thinking: thinkingText,
        response: ''
      };
    }

    // Pro模型：尝试分离thinking和response
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
  /**
   * 验证并调整thinking预算
   * 基于官方文档要求确保预算符合模型限制
   *
   * Claude: 最小1024 tokens, 必须小于max_tokens
   * Gemini: 各模型有不同的范围限制
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

    // 检查是否违反Claude的最小1024 tokens要求
    if (adjustedBudget > 0 && adjustedBudget < 1024) {
      adjustedBudget = 1024;
      warnings.push('Thinking budget adjusted to minimum 1024 tokens (Claude requirement)');
    }

    // 检查是否超过模型最大限制
    if (adjustedBudget > limits.max) {
      adjustedBudget = limits.max;
      warnings.push(`Thinking budget adjusted to model maximum ${limits.max} tokens`);
    }

    // 检查是否低于模型最小限制
    if (adjustedBudget > 0 && adjustedBudget < limits.min) {
      adjustedBudget = limits.min;
      warnings.push(`Thinking budget adjusted to model minimum ${limits.min} tokens`);
    }

    // Claude官方要求：thinking预算必须小于max_tokens
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
   * 支持新的签名格式：包含上下文和轮数信息
   */
  static validateThinkingSignature(signature: string): boolean {
    if (!signature) return false;

    // 新签名格式: sig_[hash]_[timestamp]_ctx[contextId]_t[turnNumber] (可选部分)
    // 或旧格式: sig_[hash]_[timestamp]
    const newPattern = /^sig_[a-z0-9]{1,8}_[a-z0-9]+(?:_ctx[a-z0-9]{1,8})?(?:_t\d+)?$/;
    const oldPattern = /^sig_[a-z0-9]{1,8}_[a-z0-9]+$/;

    return newPattern.test(signature) || oldPattern.test(signature);
  }

  /**
   * 从签名中提取时间戳和元信息
   * 支持新的签名格式解析
   */
  static extractSignatureInfo(signature: string): {
    timestamp: number | null;
    contextId: string | null;
    turnNumber: number | null;
    hash: string | null;
  } {
    if (!this.validateThinkingSignature(signature)) {
      return { timestamp: null, contextId: null, turnNumber: null, hash: null };
    }

    const parts = signature.split('_');
    if (parts.length < 3) {
      return { timestamp: null, contextId: null, turnNumber: null, hash: null };
    }

    const hash = parts[1] || null;
    let timestamp: number | null = null;
    let contextId: string | null = null;
    let turnNumber: number | null = null;

    try {
      timestamp = parseInt(parts[2], 36);
    } catch {
      // ignore
    }

    // 解析可选的上下文ID和轮数
    for (let i = 3; i < parts.length; i++) {
      const part = parts[i];
      if (part.startsWith('ctx')) {
        contextId = part.substring(3);
      } else if (part.startsWith('t')) {
        try {
          turnNumber = parseInt(part.substring(1), 10);
        } catch {
          // ignore
        }
      }
    }

    return { timestamp, contextId, turnNumber, hash };
  }
}