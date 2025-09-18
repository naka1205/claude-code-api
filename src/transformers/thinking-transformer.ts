/**
 * Thinking转换器 - Cloudflare Workers版本
 * 处理Extended Thinking特性的转换
 */

import { ClaudeRequest } from '../types/claude';
import { ModelMapper } from '../models';

export interface ThinkingConfig {
  thinkingBudget?: number;
  includeThoughts?: boolean;
  exposeThoughtsToClient?: boolean;
  exposeToClient?: boolean;  // 兼容性字段
}

export interface GeminiThinkingConfig {
  thinkingBudget?: number;
}

export interface ThinkingRecommendation {
  recommended: boolean;
  reason: string;
  suggestedBudget?: number;
  modelSupport: boolean;
}

export interface ModelThinkingLimits {
  min: number;
  max: number;
  default: number;
  canDisable: boolean;
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

  // 基于官方文档和Gemini模型的限制配置
  private static readonly THINKING_LIMITS: Record<string, ModelThinkingLimits> = {
    'gemini-2.5-pro': {
      min: 128,
      max: 32768,
      default: -1,  // 动态预算
      canDisable: false
    },
    'gemini-2.5-flash': {
      min: 0,
      max: 24576,
      default: -1,  // 动态预算
      canDisable: true
    },
    'gemini-2.5-flash-lite': {
      min: 512,
      max: 24576,
      default: 0,   // 默认关闭
      canDisable: true
    },
  };

  // 复杂度阈值
  private static readonly complexityThresholds = {
    low: 10,
    medium: 25,
    high: 50
  };

  /**
   * 转换thinking配置 - 增强版本，支持自动判断和默认启用
   */
  static transformThinking(
    thinking: any,
    geminiModel: string,
    claudeRequest: ClaudeRequest
  ): ThinkingConfig | null {
    // 获取模型限制
    const limits = this.THINKING_LIMITS[geminiModel];
    const modelMapper = ModelMapper.getInstance();
    const capabilities = modelMapper.getModelCapabilities(geminiModel);

    if (!limits || !capabilities.supportsThinking) {
      return null; // 模型不支持thinking
    }

    // 调试日志
    console.log('[ThinkingTransformer] thinking:', JSON.stringify(thinking));

    // 如果明确指定了thinking配置
    if (thinking) {
      console.log('[ThinkingTransformer] thinking.type:', thinking.type);
      if (thinking.type === 'enabled') {
        let budget = thinking.budget_tokens || thinking.budget || this.calculateOptimalBudget(claudeRequest, geminiModel);

        // 根据模型限制调整预算
        if (budget > 0) {
          budget = Math.max(limits.min, Math.min(budget, limits.max));
        } else {
          budget = limits.default === -1 ? this.calculateOptimalBudget(claudeRequest, geminiModel) : limits.default;
        }

        return {
          thinkingBudget: budget,
          includeThoughts: true,
          exposeThoughtsToClient: true,
          exposeToClient: true  // 兼容性字段
        };
      } else if (thinking.type === 'disabled') {
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

    // 自动判断是否启用thinking (基于复杂度和模型默认)
    const complexity = this.analyzeComplexity(claudeRequest);
    let budget = limits.default;

    if (budget === -1) {
      // 动态预算，基于复杂度计算
      budget = this.calculateOptimalBudget(claudeRequest, geminiModel);
    } else if (budget === 0 && complexity.recommendation === 'enable') {
      // 默认关闭但建议开启的情况
      budget = this.calculateOptimalBudget(claudeRequest, geminiModel);
    }

    // 如果自动计算的预算为0，返回null（不启用thinking）
    if (budget === 0) {
      return null;
    }

    return {
      thinkingBudget: budget,
      includeThoughts: budget > 0,
      exposeThoughtsToClient: budget > 0, // 有思考预算时暴露思考内容
      exposeToClient: budget > 0 // 有思考预算时暴露给客户端
    };
  }

  /**
   * 计算最优thinking预算 (基于任务复杂度)
   */
  private static calculateOptimalBudget(claudeRequest: ClaudeRequest, geminiModel: string): number {
    const limits = this.THINKING_LIMITS[geminiModel];
    if (!limits) return this.defaultBudget;

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
   * 分析请求复杂度 - 增强版本
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

    claudeRequest.messages?.forEach(message => {
      roles.add(message.role);

      if (typeof message.content === 'string') {
        totalTextLength += message.content.length;
        if (this.containsComplexPatterns(message.content)) {
          hasComplexContent = true;
        }
      } else if (Array.isArray(message.content)) {
        message.content.forEach((block: any) => {
          if (block.type === 'text' && block.text) {
            totalTextLength += block.text.length;
            if (this.containsComplexPatterns(block.text)) {
              hasComplexContent = true;
            }
          } else if (block.type === 'tool_use' || block.type === 'tool_result') {
            hasToolUse = true;
          }
        });
      }
    });

    factors.messageLength = totalTextLength;
    factors.hasMultipleRoles = roles.size > 1;
    factors.hasComplexContent = hasComplexContent;

    // 分析工具使用
    factors.toolCount = claudeRequest.tools ? claudeRequest.tools.length : 0;
    if (hasToolUse) {
      factors.toolCount = Math.max(factors.toolCount, 1);
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
        (claudeRequest.system as any[]).map(b => b.text || '').join(' ');
      score += Math.min(systemText.length / 200, 10);
    }

    // 检查是否有代码块或数学内容
    const hasCodeBlocks = claudeRequest.messages?.some(msg => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return content.includes('```') || content.includes('function') || content.includes('class');
    });

    if (hasCodeBlocks) {
      score += 15;
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
    const codePatterns = /```|`[^`]+`|<\/?\w+>|\{[\s\S]*\}/;

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
        (claudeRequest.system as any[]).map(b => b.text || '').join(' ');
      if (predicate(systemText)) return true;
    }

    // 检查消息
    for (const message of claudeRequest.messages || []) {
      if (typeof message.content === 'string') {
        if (predicate(message.content)) return true;
      } else if (Array.isArray(message.content)) {
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
   * 获取thinking推荐配置 - 增强版本
   */
  static getThinkingRecommendation(
    claudeRequest: ClaudeRequest,
    geminiModel: string
  ): ThinkingRecommendation & { complexity?: ComplexityAnalysis; estimatedBudget?: number } {
    const complexity = this.analyzeComplexity(claudeRequest);
    const estimatedBudget = this.calculateOptimalBudget(claudeRequest, geminiModel);
    const modelSupports = this.modelSupportsThinking(geminiModel);

    let recommended = false;
    let reason = '';

    if (!modelSupports) {
      reason = `Model ${geminiModel} does not support thinking feature`;
    } else if (complexity.recommendation === 'enable') {
      recommended = true;
      reason = `Request complexity is high (score: ${complexity.score}), thinking is recommended`;
    } else if (complexity.recommendation === 'auto') {
      recommended = complexity.score > this.complexityThresholds.medium;
      reason = `Request complexity is moderate (score: ${complexity.score}), ${recommended ? 'thinking recommended' : 'thinking optional'}`;
    } else {
      reason = `Request complexity is low (score: ${complexity.score}), thinking not recommended`;
    }

    return {
      recommended,
      reason,
      suggestedBudget: estimatedBudget,
      modelSupport: modelSupports,
      complexity,
      estimatedBudget
    };
  }

  /**
   * 检查模型是否支持thinking
   */
  static modelSupportsThinking(geminiModel: string): boolean {
    const modelMapper = ModelMapper.getInstance();
    const capabilities = modelMapper.getModelCapabilities(geminiModel);
    return !!this.THINKING_LIMITS[geminiModel] && capabilities.supportsThinking;
  }

  /**
   * 从响应中提取thinking内容
   */
  static extractThinkingFromResponse(response: any): {
    thoughts?: string;
    thoughtsTokenCount?: number;
  } | null {
    console.log('[ThinkingTransformer] Extracting thinking from response');

    // 检查是否有thinking内容
    if (!response.candidates?.[0]?.content?.parts) {
      console.log('[ThinkingTransformer] No parts found in response');
      return null;
    }

    // 记录所有parts的类型
    console.log('[ThinkingTransformer] Response parts:', response.candidates[0].content.parts.map((p: any) => {
      const keys = Object.keys(p);
      if ('thought' in p) return { type: 'thought', content: p.thought };
      if ('text' in p) return { type: 'text', length: p.text?.length };
      return { type: 'unknown', keys };
    }));

    for (const part of response.candidates[0].content.parts) {
      // 检查是否是思考内容（基于BAK版本的正确逻辑）
      if ('text' in part && 'thought' in part && part.thought === true) {
        console.log('[ThinkingTransformer] Found thinking content in part.text:', part.text);
        return {
          thoughts: part.text,
          thoughtsTokenCount: part.thoughtTokenCount
        };
      }

      // 检查是否有传统的thought字段（对象格式）
      if (part.thought && typeof part.thought === 'object' && 'content' in part.thought) {
        console.log('[ThinkingTransformer] Found thought object:', part.thought);
        return {
          thoughts: part.thought.content,
          thoughtsTokenCount: part.thoughtTokenCount || part.thought?.tokenCount
        };
      }

      // 检查thoughtSignature（加密上下文令牌，不是思考内容）
      if (part.thoughtSignature) {
        console.log('[ThinkingTransformer] Found thoughtSignature (context token), not exposing as thinking content');
        // thoughtSignature不是思考内容，跳过
        continue;
      }

      // 检查是否有modelOutputThought字段（Gemini 2.5的新格式）
      if (part.modelOutputThought) {
        console.log('[ThinkingTransformer] Found modelOutputThought:', part.modelOutputThought);
        return {
          thoughts: part.modelOutputThought,
          thoughtsTokenCount: part.modelOutputThoughtTokenCount
        };
      }
    }

    // 检查usageMetadata中的thinking tokens
    if (response.usageMetadata) {
      console.log('[ThinkingTransformer] UsageMetadata:', response.usageMetadata);
      if (response.usageMetadata.thoughtsTokenCount || response.usageMetadata.modelOutputThoughtTokenCount) {
        return {
          thoughtsTokenCount: response.usageMetadata.thoughtsTokenCount || response.usageMetadata.modelOutputThoughtTokenCount
        };
      }
    }

    console.log('[ThinkingTransformer] No thinking content found');
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