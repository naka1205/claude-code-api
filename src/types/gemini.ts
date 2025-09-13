/**
 * Gemini API 接口类型定义
 * 定义与Gemini API交互所需的所有类型和接口
 */

import { JSONSchema } from './claude';

// Gemini 内容部分
export interface GeminiPart {
  text?: string;
  functionCall?: GeminiFunctionCall;
  functionResponse?: GeminiFunctionResponse;
  thought?: boolean;
  thoughtSignature?: string;  // Gemini API returns this field to mark thinking content
  inlineData?: {
    mimeType: string;
    data: string;
  };
  fileData?: {
    mimeType: string;
    fileUri: string;
  };
}

// Gemini 函数调用
export interface GeminiFunctionCall {
  name: string;
  args: Record<string, any>;
}

// Gemini 函数响应
export interface GeminiFunctionResponse {
  name: string;
  response: Record<string, any>;
}

// Gemini 内容
export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

// Gemini 函数声明
export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: JSONSchema;
}

// Gemini Google搜索工具
export interface GeminiGoogleSearch {
  // 基于Claude官方文档的Google搜索工具配置参数
  maxUses?: number;
  allowedDomains?: string[];
  blockedDomains?: string[];
  userLocation?: {
    type: 'approximate' | 'exact';
    city?: string;
    region?: string;
    country?: string;
    timezone?: string;
  };
}

// Gemini URL上下文工具
export interface GeminiURLContext {
  // 根据Gemini官方文档，URL Context通过在content parts中添加URL实现
  // 这里只是标记启用状态，实际URL在GeminiPart中处理
}

// Gemini 工具
export interface GeminiTool {
  functionDeclarations?: GeminiFunctionDeclaration[];
  google_search?: GeminiGoogleSearch;
  url_context?: GeminiURLContext;
}

// Gemini 工具配置
export interface GeminiToolConfig {
  functionCallingConfig: {
    mode: 'AUTO' | 'ANY' | 'NONE';
    allowedFunctionNames?: string[];
  };
}

// Gemini 生成配置
export interface GeminiGenerationConfig {
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  candidateCount?: number;
  thinkingConfig?: {
    includeThoughts?: boolean;
    thinkingBudget?: number;
    exposeThoughtsToClient?: boolean;
  };
  citationConfig?: {
    enabled: boolean;
    style: 'numeric' | 'alphabetic';
    includeUrls?: boolean;
  };
}

// Gemini 安全设置
export interface GeminiSafetySetting {
  category: string;
  threshold: string;
}

// Gemini 请求接口
export interface GeminiRequest {
  contents: GeminiContent[];
  generationConfig?: GeminiGenerationConfig;
  tools?: GeminiTool[];
  toolConfig?: GeminiToolConfig;
  safetySettings?: GeminiSafetySetting[];
  systemInstruction?: {
    parts: GeminiPart[];
  };
  cachedContent?: any; // 用于 Context Caching
}

// Gemini 使用元数据
export interface GeminiUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
  cachedContentTokenCount?: number;
  thoughtsTokenCount?: number; // 思考token计数
}

// Gemini 候选项
export interface GeminiCandidate {
  content: GeminiContent;
  finishReason?: 'FINISH_REASON_UNSPECIFIED' | 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'LANGUAGE' | 'PROHIBITED_CONTENT' | 'SPII' | 'MALFORMED_FUNCTION_CALL' | 'OTHER';
  index: number;
  safetyRatings?: Array<{
    category: string;
    probability: string;
  }>;
  groundingAttributions?: Array<{
    source?: {
      title?: string;
      uri?: string;
      url?: string;
    };
    segment?: {
      source?: {
        title?: string;
        uri?: string;
        url?: string;
      };
    };
  }>;
}

// Gemini 响应接口
export interface GeminiResponse {
  candidates: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  promptFeedback?: {
    safetyRatings: Array<{
      category: string;
      probability: string;
    }>;
    blockReason?: string;
  };
}

// Gemini 流式响应
export interface GeminiStreamResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  promptFeedback?: {
    safetyRatings: Array<{
      category: string;
      probability: string;
    }>;
    blockReason?: string;
  };
}

// Gemini 错误响应
export interface GeminiErrorResponse {
  error: {
    code: number;
    message: string;
    status: string;
    details?: any[];
  };
}
