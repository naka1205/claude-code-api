/**
 * Model mapping configuration between Claude and Gemini
 */

export interface ModelInfo {
  geminiModel: string;
  contextWindow: number;
  supportsThinking: boolean;
  supportsTools: boolean;
}

/**
 * Map Claude model names to Gemini models
 */
export const MODEL_MAPPING: Record<string, ModelInfo> = {
  // Opus 4 series -> Gemini 2.5 Pro
  'claude-opus-4-1-20250805': {
    geminiModel: 'gemini-2.5-pro',
    contextWindow: 2000000,
    supportsThinking: true,
    supportsTools: true,
  },
  'claude-opus-4-20250514': {
    geminiModel: 'gemini-2.5-pro',
    contextWindow: 2000000,
    supportsThinking: true,
    supportsTools: true,
  },

  // Sonnet 4 series -> Gemini 2.5 Flash
  'claude-sonnet-4-20250514': {
    geminiModel: 'gemini-2.5-flash',
    contextWindow: 1000000,
    supportsThinking: true,
    supportsTools: true,
  },
  'claude-sonnet-4-5-20250929': {
    geminiModel: 'gemini-2.5-flash',
    contextWindow: 1000000,
    supportsThinking: true,
    supportsTools: true,
  },

  // Sonnet 3.7 series -> Gemini 2.5 Flash Lite
  'claude-3-7-sonnet-20250219': {
    geminiModel: 'gemini-2.5-flash-lite',
    contextWindow: 1000000,
    supportsThinking: true,
    supportsTools: true,
  },

  // Sonnet 3.5 series -> Gemini 2.5 Flash Lite
  'claude-3-5-sonnet-20241022': {
    geminiModel: 'gemini-2.5-flash-lite',
    contextWindow: 1000000,
    supportsThinking: false,
    supportsTools: true,
  },
  'claude-3-5-sonnet-20240620': {
    geminiModel: 'gemini-2.5-flash-lite',
    contextWindow: 1000000,
    supportsThinking: false,
    supportsTools: true,
  },

  // Haiku 3.5 series -> Gemini 2.0 Flash
  'claude-3-5-haiku-20241022': {
    geminiModel: 'gemini-2.0-flash',
    contextWindow: 1000000,
    supportsThinking: false,
    supportsTools: true,
  },
};

/**
 * Get Gemini model name from Claude model name
 */
export function getGeminiModel(claudeModel: string): string {
  const modelInfo = MODEL_MAPPING[claudeModel];

  if (!modelInfo) {
    // Default fallback to Gemini 2.5 Flash
    console.error(`[Models] Unknown Claude model: ${claudeModel}, falling back to gemini-2.5-flash`);
    return 'gemini-2.5-flash';
  }

  return modelInfo.geminiModel;
}

/**
 * Check if model supports thinking
 */
export function supportsThinking(claudeModel: string): boolean {
  const modelInfo = MODEL_MAPPING[claudeModel];
  return modelInfo?.supportsThinking ?? false;
}

/**
 * Check if model supports tools
 */
export function supportsTools(claudeModel: string): boolean {
  const modelInfo = MODEL_MAPPING[claudeModel];
  return modelInfo?.supportsTools ?? true;
}