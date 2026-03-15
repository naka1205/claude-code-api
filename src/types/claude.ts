/**
 * Claude API 类型定义
 * 基于 Anthropic Claude API 官方文档
 */

/**
 * Claude 消息角色
 */
export type ClaudeRole = 'user' | 'assistant';

/**
 * Claude 文本内容块
 */
export interface ClaudeTextContent {
  type: 'text';
  text: string;
}

/**
 * Claude 图像内容块
 */
export interface ClaudeImageContent {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

/**
 * Claude 文档内容块
 */
export interface ClaudeDocumentContent {
  type: 'document';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
  cache_control?: {
    type: 'ephemeral';
  };
}

/**
 * Claude 消息内容
 */
export type ClaudeContent = ClaudeTextContent | ClaudeImageContent | ClaudeDocumentContent;

/**
 * Claude 消息
 */
export interface ClaudeMessage {
  role: ClaudeRole;
  content: string | ClaudeContent[];
}

/**
 * Claude 系统消息
 */
export interface ClaudeSystemMessage {
  type: 'text';
  text: string;
  cache_control?: {
    type: 'ephemeral';
  };
}

/**
 * Claude 工具定义
 */
export interface ClaudeTool {
  name: string;
  description?: string;
  input_schema: {
    type: 'object';
    properties?: Record<string, any>;
    required?: string[];
  };
  type?: string; // For official tools like 'web_search_20250305'
}

/**
 * Claude 元数据
 */
export interface ClaudeMetadata {
  user_id?: string;
}

/**
 * Claude 请求
 */
/**
 * Claude 工具选择类型
 */
export type ClaudeToolChoice =
  | 'auto'
  | 'none'
  | 'any'
  | 'required'
  | {
      type: 'auto' | 'any' | 'tool' | 'none';
      name?: string;
    };

/**
 * Claude Extended Thinking 配置
 * 基于官方文档: https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking
 *
 * Claude 4.6 系列推荐使用 adaptive 模式（无需手动指定 budget_tokens）
 * 旧版模型（如 3.7 Sonnet）仍使用 enabled + budget_tokens
 */
export interface ClaudeThinking {
  /** thinking类型
   * - 'adaptive': 自适应思考（Claude 4.6 推荐），通过 effort 控制思考强度
   * - 'enabled': 启用思考（旧版），需指定 budget_tokens
   * - 'disabled': 禁用思考
   */
  type: 'adaptive' | 'enabled' | 'disabled';
  /** 思考精力控制（仅 adaptive 模式）
   * - 'low': 极其高效，适合速度敏感或简单任务
   * - 'medium': 平衡性能与成本
   * - 'high' (默认): 发挥模型标准最高推理能力
   * - 'max' (Opus 4.6 专属): 针对极高难度任务
   */
  effort?: 'low' | 'medium' | 'high' | 'max';
  /** 思考预算token数（仅 enabled 模式）
   * 官方要求：最小1024 tokens，必须小于max_tokens
   */
  budget_tokens?: number;
}

export interface ClaudeRequest {
  model: string;
  messages: ClaudeMessage[];
  max_tokens: number;
  metadata?: ClaudeMetadata;
  stop_sequences?: string[];
  stream?: boolean;
  system?: string | ClaudeSystemMessage[];
  temperature?: number;
  tools?: ClaudeTool[];
  tool_choice?: ClaudeToolChoice;
  top_p?: number;
  top_k?: number;
  thinking?: ClaudeThinking;
  // Claude特有参数
  'anthropic-version'?: string;
  'anthropic-beta'?: string[];
  type?: string; // For official tools
}

/**
 * Claude 工具使用响应
 */
export interface ClaudeToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: any;
}

/**
 * Claude 文本响应块
 */
export interface ClaudeTextBlock {
  type: 'text';
  text: string;
}

/**
 * Claude 思考内容块 - Extended Thinking支持
 * 基于官方文档：支持签名、上下文和流式响应
 */
export interface ClaudeThinkingBlock {
  type: 'thinking';
  thinking: string;
  /** 思考内容的签名验证，用于多轮对话上下文维护 */
  signature?: string;
  /** 是否为流式响应中的部分内容 */
  streaming?: boolean;
  /** 上下文ID，用于多轮对话追踪 */
  contextId?: string;
  /** 轮数，用于多轮对话追踪 */
  turnNumber?: number;
  /** 内部使用标记，不暴露给客户端 */
  internal?: boolean;
}

/**
 * Claude 工具结果响应
 */
export interface ClaudeToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content?: string;
  is_error?: boolean;
  error_code?: string;  // 可选：错误码（客户端自定义）
  error_details?: Record<string, any>;  // 可选：错误详情（客户端自定义）
}

/**
 * Claude 响应内容块
 */
export type ClaudeContentBlock = ClaudeTextBlock | ClaudeThinkingBlock | ClaudeToolUse | ClaudeToolResult;

/**
 * Claude 响应
 */
export interface ClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: ClaudeContentBlock[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | 'pause_turn' | 'refusal' | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

/**
 * Claude 流式事件类型
 */
export type ClaudeStreamEventType =
  | 'message_start'
  | 'content_block_start'
  | 'ping'
  | 'content_block_delta'
  | 'content_block_stop'
  | 'message_delta'
  | 'message_stop'
  | 'error';

/**
 * Claude 流式事件
 * 基于官方文档：https://docs.claude.com/zh-CN/docs/build-with-claude/streaming
 */
export interface ClaudeStreamEvent {
  type: ClaudeStreamEventType;
  message?: ClaudeResponse;
  index?: number;
  content_block?: ClaudeContentBlock;
  delta?: {
    type: 'text_delta' | 'input_json_delta' | 'thinking_delta' | 'signature_delta';
    text?: string;
    thinking?: string;  // Extended thinking 内容delta
    signature?: string; // Thinking signature (独立事件)
    partial_json?: string;
    stop_reason?: string;
    stop_sequence?: string;
    usage?: {
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  error?: {
    type: string;
    message: string;
  };
}

/**
 * Claude 错误响应
 */
export interface ClaudeErrorResponse {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

/**
 * Claude 计数请求
 */
export interface ClaudeCountRequest {
  model: string;
  messages: ClaudeMessage[];
  system?: string | ClaudeSystemMessage[];
  tools?: ClaudeTool[];
}

/**
 * Claude 计数响应
 */
export interface ClaudeCountResponse {
  input_tokens: number;
}