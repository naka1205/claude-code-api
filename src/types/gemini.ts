/**
 * Gemini API 类型定义
 * 基于 Google Gemini API 官方文档
 */

/**
 * Gemini 消息角色
 */
export type GeminiRole = 'user' | 'model' | 'system';

/**
 * Gemini 文本部分
 */
export interface GeminiTextPart {
  text: string;
}

/**
 * Gemini 内联数据部分（图像、文档等）
 */
export interface GeminiInlineDataPart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

/**
 * Gemini 函数调用部分
 */
export interface GeminiFunctionCallPart {
  functionCall: {
    name: string;
    args: Record<string, any>;
  };
}

/**
 * Gemini 函数响应部分
 */
export interface GeminiFunctionResponsePart {
  functionResponse: {
    name: string;
    response: Record<string, any>;
  };
}

/**
 * Gemini 部分类型
 */
export type GeminiPart =
  | GeminiTextPart
  | GeminiInlineDataPart
  | GeminiFunctionCallPart
  | GeminiFunctionResponsePart;

/**
 * Gemini 内容
 */
export interface GeminiContent {
  role: GeminiRole;
  parts: GeminiPart[];
}

/**
 * Gemini 生成配置
 */
export interface GeminiGenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  candidateCount?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  responseMimeType?: string;
  responseSchema?: any;
}

/**
 * Gemini 安全设置
 */
export interface GeminiSafetySettings {
  category: string;
  threshold: string;
}

/**
 * Gemini 函数声明
 */
export interface GeminiFunctionDeclaration {
  name: string;
  description?: string;
  parameters?: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

/**
 * Gemini 工具
 */
export interface GeminiTool {
  functionDeclarations?: GeminiFunctionDeclaration[];
}

/**
 * Gemini 工具配置
 */
export interface GeminiToolConfig {
  functionCallingConfig?: {
    mode?: 'AUTO' | 'ANY' | 'NONE';
    allowedFunctionNames?: string[];
  };
}

/**
 * Gemini 系统指令
 */
export interface GeminiSystemInstruction {
  role: 'system';
  parts: GeminiTextPart[];
}

/**
 * Gemini 缓存内容
 */
export interface GeminiCachedContent {
  contents: GeminiContent[];
  ttl?: string;
  name?: string;
  displayName?: string;
}

/**
 * Gemini 请求
 */
export interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: GeminiSystemInstruction;
  tools?: GeminiTool[];
  toolConfig?: GeminiToolConfig;
  generationConfig?: GeminiGenerationConfig;
  safetySettings?: GeminiSafetySettings[];
  cachedContent?: string;
}

/**
 * Gemini 候选者
 */
export interface GeminiCandidate {
  content: GeminiContent;
  finishReason?: string;
  safetyRatings?: Array<{
    category: string;
    probability: string;
    blocked?: boolean;
  }>;
  citationMetadata?: {
    citations: Array<{
      startIndex?: number;
      endIndex?: number;
      uri?: string;
      license?: string;
    }>;
  };
  tokenCount?: number;
  index?: number;
  logprobsResult?: any;
}

/**
 * Gemini 提示反馈
 */
export interface GeminiPromptFeedback {
  blockReason?: string;
  safetyRatings?: Array<{
    category: string;
    probability: string;
    blocked?: boolean;
  }>;
}

/**
 * Gemini 使用元数据
 */
export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  cachedContentTokenCount?: number;
}

/**
 * Gemini 响应
 */
export interface GeminiResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: GeminiPromptFeedback;
  usageMetadata?: GeminiUsageMetadata;
  modelVersion?: string;
}

/**
 * Gemini 流式响应
 */
export interface GeminiStreamResponse extends GeminiResponse {
  // 流式响应与普通响应结构相同
}

/**
 * Gemini 错误响应
 */
export interface GeminiErrorResponse {
  error: {
    code: number;
    message: string;
    status: string;
    details?: any[];
  };
}

/**
 * Gemini 计数请求
 */
export interface GeminiCountRequest {
  contents: GeminiContent[];
  systemInstruction?: GeminiSystemInstruction;
  tools?: GeminiTool[];
  generationConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
  };
}

/**
 * Gemini 计数响应
 */
export interface GeminiCountResponse {
  totalTokens: number;
  cachedContentTokenCount?: number;
}