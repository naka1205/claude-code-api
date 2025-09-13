/**
 * Claude API 接口类型定义
 * 定义与Claude API交互所需的所有类型和接口
 */

// JSON Schema 类型定义
export interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: any[];
  description?: string;
  additionalProperties?: boolean | JSONSchema;
  [key: string]: any;
}

// 图像源接口
export interface ImageSource {
  type: 'base64';
  media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  data: string;
}

// Claude 内容块类型
export interface ClaudeContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result' | 'thinking';
  text?: string;
  source?: ImageSource;
  id?: string;
  name?: string;
  input?: any;
  content?: any;
  thinking?: string;
  signature?: string; // For thinking blocks - Claude的加密验证签名
  is_error?: boolean;
  tool_use_id?: string; // For tool_result blocks
}

// Claude 消息接口
export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
}

// Claude 工具定义
export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: JSONSchema;
  // 支持Claude官方工具类型
  type?: 'web_search_20250305' | 'web_fetch_20250305' | 'function';
  // Claude官方工具的额外配置参数
  max_uses?: number;
  allowed_domains?: string[];
  blocked_domains?: string[];
  user_location?: {
    type: 'approximate' | 'exact';
    city?: string;
    region?: string;
    country?: string;
    timezone?: string;
  };
}

// Claude 工具选择类型
export type ClaudeToolChoice =
  | 'auto'
  | 'none'
  | { type: 'tool'; name: string };

// Claude 思考配置
export interface ClaudeThinking {
  type: 'enabled' | 'disabled';
  budget_tokens?: number;
}

// Claude 请求接口
export interface ClaudeRequest {
  model: string;
  messages: ClaudeMessage[];
  system?: string | ClaudeContentBlock[];
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  tools?: ClaudeTool[];
  tool_choice?: ClaudeToolChoice;
  thinking?: ClaudeThinking;
  service_tier?: 'auto' | 'standard_only'; // Claude API官方参数
  metadata?: Record<string, any>; // 请求元数据
}

// Claude 使用统计
export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  thoughts_output_tokens?: number; // 思考token计数 (Extended Thinking)
  total_tokens?: number; // 总token计数
}

// Claude 响应接口
export interface ClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  model: string;
  content: ClaudeContentBlock[];
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
  stop_sequence: string | null;
  usage: ClaudeUsage;
}

// Claude 流式事件类型
export interface ClaudeStreamEvent {
  type: 'message_start' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_delta' | 'message_stop' | 'error';
  message?: Partial<ClaudeResponse>;
  content_block?: ClaudeContentBlock;
  delta?: {
    type: 'text_delta' | 'input_json_delta';
    text?: string;
    partial_json?: string;
  };
  index?: number;
  usage?: ClaudeUsage;
  error?: {
    type: string;
    message: string;
  };
}
