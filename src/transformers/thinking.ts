/**
 * 思考转换器 V2
 * 负责处理Claude的Extended Thinking配置转换
 */

import { ClaudeThinking, ClaudeRequest } from '../types/claude';

export interface ThinkingConfig {
  // Gemini API的thinkingConfig参数结构 (基于官方文档)
  thinkingBudget: number;
  includeThoughts?: boolean;
  exposeThoughtsToClient?: boolean;
  exposeToClient?: boolean;  // 兼容性字段
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

  // 基于官方文档 (README.md:82-134行) 的模型限制
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
   * 转换Claude的thinking配置为Gemini格式 (增强版本)
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

    // 调试日志
    console.log('[ThinkingTransformer] claudeThinking:', JSON.stringify(claudeThinking));

    // 如果明确指定了thinking配置
    if (claudeThinking) {
      console.log('[ThinkingTransformer] claudeThinking.type:', claudeThinking.type);
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
          exposeThoughtsToClient: true,
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
   * 检查模型是否支持thinking (基于官方文档)
   */
  static modelSupportsThinking(geminiModel: string): boolean {
    return !!this.THINKING_LIMITS[geminiModel];
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
   * 计算思考预算
   */
  static calculateThinkingBudget(claudeRequest: ClaudeRequest, geminiModel: string): number {
    const complexity = this.analyzeComplexity(claudeRequest);
    const limits = this.THINKING_LIMITS[geminiModel];
    
    if (!limits) {
      return this.defaultBudget;
    }

    // 基于复杂度计算预算
    let budget = this.defaultBudget;
    
    if (complexity.score < this.complexityThresholds.low) {
      budget = Math.floor(this.defaultBudget * 0.5);
    } else if (complexity.score > this.complexityThresholds.high) {
      budget = Math.floor(this.defaultBudget * 2);
    }

    // 确保在模型限制范围内
    budget = Math.max(limits.min, Math.min(budget, limits.max));
    
    return budget;
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
    const estimatedBudget = this.calculateThinkingBudget(claudeRequest, geminiModel);
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
   * 创建思考配置模板 (符合Gemini API格式)
   */
  static createThinkingConfig(
    enabled: boolean,
    budget?: number,
    exposeToClient: boolean = false
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
   * 优化思考预算
   */
  static optimizeThinkingBudget(
    currentBudget: number,
    maxOutputTokens: number,
    complexity: ComplexityAnalysis
  ): number {
    // 不超过输出上限的30%
    const maxAllowed = Math.floor(maxOutputTokens * 0.3);
    
    // 根据复杂度调整
    let optimizedBudget = currentBudget;
    
    if (complexity.score < this.complexityThresholds.low) {
      optimizedBudget = Math.floor(currentBudget * 0.7);
    } else if (complexity.score > this.complexityThresholds.high) {
      optimizedBudget = Math.floor(currentBudget * 1.2);
    }

    return Math.max(100, Math.min(optimizedBudget, maxAllowed));
  }

  /**
   * 验证思考配置
   */
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
        if (config.thinkingBudget < 50) {
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
}