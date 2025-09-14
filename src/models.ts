/**
 * 模型映射器
 * 处理Claude模型到Gemini模型的映射
 */

/**
 * 模型能力配置
 */
export interface ModelCapabilities {
  maxInputTokens: number;
  maxOutputTokens: number;
  supportsFunctions: boolean;
  supportsVision: boolean;
  supportsSystemMessage: boolean;
  supportsCaching: boolean;
  supportsStreaming: boolean;
  supportsThinking?: boolean;
  contextWindow: number;
}

/**
 * 模型映射配置
 */
export interface ModelMapping {
  source: string;
  target: string;
  capabilities: ModelCapabilities;
}

/**
 * 默认Gemini模型
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * Claude到Gemini的模型映射表
 * 根据相似能力进行映射
 */
export const MODEL_MAPPING: Record<string, string> = {
  'claude-opus-4-1-20250805': 'gemini-2.5-pro',
  'claude-opus-4-20250514': 'gemini-2.5-pro',
  'claude-sonnet-4-20250514': 'gemini-2.5-flash',
  'claude-3-7-sonnet-20250219': 'gemini-2.5-flash-lite',
  'claude-3-5-sonnet-20241022': 'gemini-2.5-flash-lite',
  'claude-3-5-haiku-20241022': 'gemini-2.0-flash',
};

/**
 * Gemini模型能力配置
 */
export const GEMINI_MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  'gemini-2.5-pro': {
    maxInputTokens: 1000000,
    maxOutputTokens: 8192,
    supportsFunctions: true,
    supportsVision: true,
    supportsSystemMessage: true,
    supportsCaching: true,
    supportsStreaming: true,
    supportsThinking: true,
    contextWindow: 1000000
  },
  'gemini-2.5-flash': {
    maxInputTokens: 1000000,
    maxOutputTokens: 8192,
    supportsFunctions: true,
    supportsVision: true,
    supportsSystemMessage: true,
    supportsCaching: true,
    supportsStreaming: true,
    supportsThinking: true,
    contextWindow: 1000000
  },
  'gemini-2.5-flash-lite': {
    maxInputTokens: 1000000,
    maxOutputTokens: 8192,
    supportsFunctions: true,
    supportsVision: true,
    supportsSystemMessage: true,
    supportsCaching: false,
    supportsStreaming: true,
    supportsThinking: false,
    contextWindow: 1000000
  },
  'gemini-2.0-flash': {
    maxInputTokens: 32768,
    maxOutputTokens: 8192,
    supportsFunctions: true,
    supportsVision: true,
    supportsSystemMessage: true,
    supportsCaching: false,
    supportsStreaming: true,
    supportsThinking: false,
    contextWindow: 32768
  }
};

/**
 * 模型映射器类
 */
export class ModelMapper {
  private static instance: ModelMapper;
  private customMappings: Map<string, string> = new Map();

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): ModelMapper {
    if (!ModelMapper.instance) {
      ModelMapper.instance = new ModelMapper();
    }
    return ModelMapper.instance;
  }

  /**
   * 映射Claude模型到Gemini模型
   */
  mapModel(claudeModel: string): string {
    // 检查自定义映射
    if (this.customMappings.has(claudeModel)) {
      return this.customMappings.get(claudeModel)!;
    }

    // 检查预定义映射
    if (MODEL_MAPPING[claudeModel]) {
      return MODEL_MAPPING[claudeModel];
    }

    // 智能匹配：基于模型名称模式
    if (claudeModel.includes('opus')) {
      return 'gemini-2.5-pro';
    }
    if (claudeModel.includes('sonnet')) {
      return 'gemini-2.5-flash';
    }
    if (claudeModel.includes('haiku')) {
      return 'gemini-2.5-flash-lite';
    }
    if (claudeModel.includes('instant')) {
      return 'gemini-2.5-flash-lite';
    }

    // 返回默认模型
    console.warn(`Unknown Claude model: ${claudeModel}, using default mapping`);
    return DEFAULT_GEMINI_MODEL;
  }

  /**
   * 获取模型能力
   */
  getModelCapabilities(model: string): ModelCapabilities {
    // 先尝试映射Claude模型
    const geminiModel = this.mapModel(model);

    if (GEMINI_MODEL_CAPABILITIES[geminiModel]) {
      return GEMINI_MODEL_CAPABILITIES[geminiModel];
    }

    // 返回默认能力配置
    return GEMINI_MODEL_CAPABILITIES['gemini-2.5-flash'];
  }

  /**
   * 添加自定义模型映射
   */
  addCustomMapping(claudeModel: string, geminiModel: string): void {
    this.customMappings.set(claudeModel, geminiModel);
  }

  /**
   * 移除自定义模型映射
   */
  removeCustomMapping(claudeModel: string): void {
    this.customMappings.delete(claudeModel);
  }

  /**
   * 获取所有映射
   */
  getAllMappings(): Record<string, string> {
    const allMappings = { ...MODEL_MAPPING };
    this.customMappings.forEach((value, key) => {
      allMappings[key] = value;
    });
    return allMappings;
  }

  /**
   * 验证Gemini模型是否支持特定功能
   */
  validateModelSupport(model: string, feature: keyof ModelCapabilities): boolean {
    const capabilities = this.getModelCapabilities(model);
    return capabilities[feature] as boolean;
  }

  /**
   * 获取推荐的最大输出token数
   */
  getRecommendedMaxTokens(claudeModel: string, requestedTokens: number): number {
    const capabilities = this.getModelCapabilities(claudeModel);
    return Math.min(requestedTokens, capabilities.maxOutputTokens);
  }
}