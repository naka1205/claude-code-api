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
  tool_choice?: {
    type: 'auto' | 'any' | 'tool';
    name?: string;
  };
  top_p?: number;
  top_k?: number;
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
 * Claude 响应内容块
 */
export type ClaudeContentBlock = ClaudeTextBlock | ClaudeToolUse;

/**
 * Claude 响应
 */
export interface ClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: ClaudeContentBlock[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null;
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
 */
export interface ClaudeStreamEvent {
  type: ClaudeStreamEventType;
  message?: ClaudeResponse;
  index?: number;
  content_block?: ClaudeContentBlock;
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
    stop_reason?: string;
    stop_sequence?: string;
    usage?: {
      output_tokens?: number;
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