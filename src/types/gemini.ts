/**
 * Gemini API 类型定义
 * 基于 Google Gemini API 官方文档
 */

/**
 * Gemini 消息角色
 */
export type GeminiRole = 'user' | 'model' | 'system' | 'tool';

/**
 * Gemini 文本部分
 * 基于官方文档：支持thinking标记
 */
export interface GeminiTextPart {
  text: string;
  /** Gemini 2.5 thinking 标记
   * 官方文档：用于标识思考内容部分
   * 不要将带有thought: true的部分连接在一起
   */
  thought?: boolean;
  /** Gemini 2.5 thinking 签名
   * 官方文档：用于在多轮对话中维护推理上下文
   * 必须原样保留并在后续请求中传回
   * 仅在启用 thinking 和 function calling 时返回
   */
  thoughtSignature?: string;
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
  /** Gemini 2.5 thinking 签名
   * 官方文档：用于在多轮对话中维护推理上下文
   * 可以与 functionCall 同级出现，表示推理结束
   */
  thoughtSignature?: string;
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
 * 基于官方文档: https://ai.google.dev/gemini-api/docs/thinking
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
  /** Gemini 3.x Thinking 配置
   * 官方文档要点：
   * - thinkingLevel: 控制推理深度级别 ('low' | 'medium' | 'high')
   * - includeThoughts: 是否包含思考内容在响应中
   * Gemini 3.1 引入 thinkingLevel 参数，取代了旧有的 token 预算模式
   */
  thinkingConfig?: {
    /** 思考级别：控制推理深度
     * - 'low': 极速响应，适合简单任务
     * - 'medium' (默认): 平衡模式，适用于大多数任务
     * - 'high': 深度推理，针对复杂任务
     */
    thinkingLevel?: 'low' | 'medium' | 'high';
    /** 是否在响应中包含思考内容 */
    includeThoughts?: boolean;
  };
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
  google_search?: Record<string, any>;
  codeExecution?: {
    languages?: string[];
  };
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
  finishMessage?: string;  // 添加finishMessage字段
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
 * 包含请求的令牌使用情况统计
 */
export interface GeminiUsageMetadata {
  /** 输入提示词的令牌数量 */
  promptTokenCount?: number;
  /** 生成候选响应的令牌数量 */
  candidatesTokenCount?: number;
  /** 总令牌数量 (prompt + candidates + thoughts) */
  totalTokenCount?: number;
  /** 从缓存中检索的内容令牌数量 */
  cachedContentTokenCount?: number;
  /** 思维推理过程的令牌数量 (仅支持Gemini 3.x系列) */
  thoughtsTokenCount?: number;
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