/**
 * 模型映射和能力检查模块
 * 负责Claude模型到Gemini模型的映射，以及模型能力的定义和检查
 */

import { ModelCapabilities } from './types/common';

// 模型映射表：Claude模型名称 -> Gemini模型名称
// 基于官方文档 https://ai.google.dev/gemini-api/docs/rate-limits
// 更新日期：2025年9月6日，仅包含图片中显示的Claude模型ID
export const MODEL_MAPPING: Record<string, string> = {
  'claude-opus-4-1-20250805': 'gemini-2.5-pro',
  'claude-opus-4-20250514': 'gemini-2.5-pro',
  'claude-sonnet-4-20250514': 'gemini-2.5-flash',
  'claude-3-7-sonnet-20250219': 'gemini-2.5-flash-lite',
  'claude-3-5-sonnet-20241022': 'gemini-2.5-flash-lite',
  'claude-3-5-haiku-20241022': 'gemini-2.0-flash',
};

// Gemini模型能力配置
// 基于官方文档 https://ai.google.dev/gemini-api/docs/rate-limits
// 注意：只有Gemini 2.5系列支持thinking功能
export const GEMINI_MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  // Gemini 2.5 系列 - 最新一代模型，支持thinking
  'gemini-2.5-pro': {
    supportsThinking: true,
    supportsVision: true,
    maxInputTokens: 2000000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsStreaming: true,
    category: 'pro'
  },
  'gemini-2.5-flash': {
    supportsThinking: true,
    supportsVision: true,
    maxInputTokens: 1000000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsStreaming: true,
    category: 'flash'
  },
  'gemini-2.5-flash-lite': {
    supportsThinking: true,
    supportsVision: true,
    maxInputTokens: 1000000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsStreaming: true,
    category: 'flash'
  },

  // Gemini 2.0 系列 - 不支持thinking
  'gemini-2.0-flash': {
    supportsThinking: false,
    supportsVision: true,
    maxInputTokens: 1000000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsStreaming: true,
    category: 'flash'
  }
};

// 支持Extended Thinking的模型列表（仅Gemini 2.5系列）
export const THINKING_SUPPORTED_MODELS = new Set([
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
]);

/**
 * 模型映射器类
 * 提供模型映射和能力检查的静态方法
 */
export class ModelMapper {
  /**
   * 将Claude模型名称映射到Gemini模型名称
   * @param claudeModel Claude模型名称
   * @returns Gemini模型名称
   * @throws Error 如果模型不支持
   */
  static mapModel(claudeModel: string): string {
    const geminiModel = MODEL_MAPPING[claudeModel];
    if (!geminiModel) {
      throw new Error(`Unsupported Claude model: ${claudeModel}`);
    }
    return geminiModel;
  }

  /**
   * 获取模型的能力配置
   * @param model 模型名称（可以是Claude或Gemini模型）
   * @returns 模型能力配置
   * @throws Error 如果模型不存在
   */
  static getCapabilities(model: string): ModelCapabilities {
    // 如果是Claude模型，先映射到Gemini模型
    let geminiModel = model;
    if (MODEL_MAPPING[model]) {
      geminiModel = MODEL_MAPPING[model];
    }

    const capabilities = GEMINI_MODEL_CAPABILITIES[geminiModel];
    if (!capabilities) {
      throw new Error(`Unknown model capabilities for: ${model}`);
    }
    return capabilities;
  }

  /**
   * 检查模型是否支持Extended Thinking功能
   * @param model 模型名称（可以是Claude或Gemini模型）
   * @returns 是否支持thinking
   */
  static isThinkingSupportedModel(model: string): boolean {
    try {
      const capabilities = this.getCapabilities(model);
      return capabilities.supportsThinking;
    } catch {
      return false;
    }
  }

  /**
   * 检查模型是否支持视觉功能
   * @param model 模型名称（可以是Claude或Gemini模型）
   * @returns 是否支持视觉
   */
  static isVisionSupportedModel(model: string): boolean {
    try {
      const capabilities = this.getCapabilities(model);
      return capabilities.supportsVision;
    } catch {
      return false;
    }
  }

  /**
   * 检查模型是否支持工具调用
   * @param model 模型名称（可以是Claude或Gemini模型）
   * @returns 是否支持工具调用
   */
  static isToolsSupportedModel(model: string): boolean {
    try {
      const capabilities = this.getCapabilities(model);
      return capabilities.supportsTools;
    } catch {
      return false;
    }
  }

  /**
   * 验证Claude模型名称是否有效
   * @param model Claude模型名称
   * @returns 是否有效
   */
  static isValidClaudeModel(model: string): boolean {
    return model in MODEL_MAPPING;
  }

  /**
   * 验证Gemini模型名称是否有效
   * @param model Gemini模型名称
   * @returns 是否有效
   */
  static isValidGeminiModel(model: string): boolean {
    return model in GEMINI_MODEL_CAPABILITIES;
  }

  /**
   * 获取所有支持的Claude模型列表
   * @returns Claude模型名称数组
   */
  static getSupportedClaudeModels(): string[] {
    return Object.keys(MODEL_MAPPING);
  }

  /**
   * 获取所有支持的Gemini模型列表
   * @returns Gemini模型名称数组
   */
  static getSupportedGeminiModels(): string[] {
    return Object.keys(GEMINI_MODEL_CAPABILITIES);
  }

  /**
   * 获取模型的最大输出token限制
   * @param model 模型名称
   * @returns 最大输出token数量
   */
  static getMaxOutputTokens(model: string): number {
    try {
      const capabilities = this.getCapabilities(model);
      return capabilities.maxOutputTokens;
    } catch {
      return 4096; // 默认值
    }
  }

  /**
   * 获取安全的最大输出token限制（按模型上限的95%保守限制），保证返回正整数
   */
  static getSafeOutputTokenLimit(model: string, requestedTokens: number): number {
    const maxTokens = this.getMaxOutputTokens(model);
    const safeLimit = Math.min(Math.floor(maxTokens * 0.95), maxTokens);
    return Math.max(1, Math.floor(Math.min(requestedTokens, safeLimit)));
  }

  /**
   * 获取模型的最大输入token限制
   * @param model 模型名称
   * @returns 最大输入token数量
   */
  static getMaxInputTokens(model: string): number {
    try {
      const capabilities = this.getCapabilities(model);
      return capabilities.maxInputTokens;
    } catch {
      return 200000; // 默认值
    }
  }
}
