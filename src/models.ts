/**
 * 模型映射 - 纯函数实现
 * Claude到Gemini模型的映射逻辑
 *
 * 基于docs/README.md中的"支持的模型与映射"表格
 */

/**
 * 模型能力接口
 */
interface ModelCapability {
  maxTokens: number;
  supportsFunctions: boolean;
  supportsSystemInstructions: boolean;
  supportsTools: boolean;
  supportsCodeExecution: boolean;
  supportsGoogleSearch: boolean;
  supportsJson: boolean;
  supportsThinking: boolean;
  contextWindow: string;
  freeRPM: number;
}

/**
 * Claude到Gemini模型映射表
 * 仅支持文档中指定的6个模型
 */
const MODEL_MAPPING: Record<string, string> = {
  // Claude Opus 4.1 -> Gemini 2.5 Pro (视觉、工具、高级性能)
  'claude-opus-4-1-20250805': 'gemini-2.5-pro',

  // Claude Opus 4 -> Gemini 2.5 Pro (视觉、工具、高级性能)
  'claude-opus-4-20250514': 'gemini-2.5-pro',

  // Claude Sonnet 4 -> Gemini 2.5 Flash (视觉、工具、高性能)
  'claude-sonnet-4-20250514': 'gemini-2.5-flash',
  'claude-sonnet-4-5-20250929': 'gemini-2.5-flash',

  // Claude 3.7 Sonnet -> Gemini 2.5 Flash (视觉、工具、高性能)
  'claude-3-7-sonnet-20250219': 'gemini-2.5-flash',

  // Claude 3.5 Sonnet -> Gemini 2.5 Flash-Lite (视觉、工具、快速高效)
  'claude-3-5-sonnet-20241022': 'gemini-2.5-flash-lite',

  // Claude 3.5 Haiku -> Gemini 2.0 Flash (视觉、工具、快速)
  'claude-3-5-haiku-20241022': 'gemini-2.0-flash'
};

/**
 * Gemini模型能力配置
 */
const GEMINI_MODEL_CAPABILITIES: Record<string, ModelCapability> = {
  'gemini-2.5-pro': {
    maxTokens: 8192,
    supportsFunctions: true,
    supportsSystemInstructions: true,
    supportsTools: true,
    supportsCodeExecution: true,
    supportsGoogleSearch: true,
    supportsJson: true,
    supportsThinking: true,
    contextWindow: '2M tokens',
    freeRPM: 5
  },
  'gemini-2.5-flash': {
    maxTokens: 8192,
    supportsFunctions: true,
    supportsSystemInstructions: true,
    supportsTools: true,
    supportsCodeExecution: true,
    supportsGoogleSearch: true,
    supportsJson: true,
    supportsThinking: true,
    contextWindow: '1M tokens',
    freeRPM: 10
  },
  'gemini-2.5-flash-lite': {
    maxTokens: 8192,
    supportsFunctions: true,
    supportsSystemInstructions: true,
    supportsTools: true,
    supportsCodeExecution: true,
    supportsGoogleSearch: true,
    supportsJson: true,
    supportsThinking: true,
    contextWindow: '1M tokens',
    freeRPM: 15
  },
  'gemini-2.0-flash': {
    maxTokens: 8192,
    supportsFunctions: true,
    supportsSystemInstructions: true,
    supportsTools: true,
    supportsCodeExecution: false,
    supportsGoogleSearch: false,
    supportsJson: true,
    supportsThinking: false,
    contextWindow: '1M tokens',
    freeRPM: 30
  }
};

/**
 * 映射Claude模型到Gemini模型
 */
export function mapModel(claudeModel: string): string {
  const normalizedModel = claudeModel.toLowerCase().trim();
  const mappedModel = MODEL_MAPPING[normalizedModel];

  if (!mappedModel) {
    throw new Error(`Unsupported Claude model: ${claudeModel}. Supported models: ${Object.keys(MODEL_MAPPING).join(', ')}`);
  }

  return mappedModel;
}

/**
 * 获取Gemini模型能力
 */
export function getModelCapabilities(geminiModel: string): ModelCapability {
  const capabilities = GEMINI_MODEL_CAPABILITIES[geminiModel];

  if (!capabilities) {
    throw new Error(`Unknown Gemini model: ${geminiModel}`);
  }

  return capabilities;
}

/**
 * 验证Claude模型是否受支持
 */
export function isClaudeModelSupported(model: string): boolean {
  return Object.keys(MODEL_MAPPING).includes(model.toLowerCase().trim());
}

// 导出常量供其他模块使用
export { MODEL_MAPPING, GEMINI_MODEL_CAPABILITIES };

// 保持向后兼容的ModelMapper类
export class ModelMapper {
  private static instance: ModelMapper;

  static getInstance(): ModelMapper {
    if (!ModelMapper.instance) {
      ModelMapper.instance = new ModelMapper();
    }
    return ModelMapper.instance;
  }

  mapModel(claudeModel: string): string {
    return mapModel(claudeModel);
  }

  getModelCapabilities(geminiModel: string): ModelCapability {
    return getModelCapabilities(geminiModel);
  }

  getRecommendedMaxTokens(geminiModel: string): number {
    const capabilities = getModelCapabilities(geminiModel);
    return capabilities.maxTokens || 8192;
  }

  getSupportedModels(): string[] {
    return Object.keys(MODEL_MAPPING);
  }
}

// 导出类型
export type { ModelCapability };
export type ModelCapabilities = ModelCapability; // 向后兼容