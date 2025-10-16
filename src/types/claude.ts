/**
 * Claude API Type Definitions
 * Based on official Claude API documentation
 */

// ============= Request Types =============

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
}

export type ClaudeContentBlock =
  | ClaudeTextBlock
  | ClaudeImageBlock
  | ClaudeToolUseBlock
  | ClaudeToolResultBlock
  | ClaudeThinkingBlock;

export interface ClaudeTextBlock {
  type: 'text';
  text: string;
}

export interface ClaudeImageBlock {
  type: 'image';
  source: {
    type: 'base64' | 'url';
    media_type?: string;
    data?: string;
    url?: string;
  };
}

export interface ClaudeToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface ClaudeToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | ClaudeContentBlock[];
  is_error?: boolean;
}

export interface ClaudeThinkingBlock {
  type: 'thinking';
  thinking: string;
  signature?: string;
}

export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export type ClaudeToolChoice =
  | { type: 'auto' }
  | { type: 'any' }
  | { type: 'tool'; name: string };

export interface ClaudeThinkingConfig {
  type: 'enabled' | 'disabled';
  budget_tokens?: number;
}

export interface ClaudeMessagesRequest {
  model: string;
  messages: ClaudeMessage[];
  max_tokens: number;
  system?: string | ClaudeContentBlock[];
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  tools?: ClaudeTool[];
  tool_choice?: ClaudeToolChoice;
  thinking?: ClaudeThinkingConfig;
  metadata?: {
    user_id?: string;
  };
}

// ============= Response Types =============

export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export type ClaudeStopReason =
  | 'end_turn'
  | 'max_tokens'
  | 'stop_sequence'
  | 'tool_use'
  | 'pause_turn'
  | 'refusal';

export interface ClaudeMessagesResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: ClaudeContentBlock[];
  model: string;
  stop_reason: ClaudeStopReason | null;
  stop_sequence: string | null;
  usage: ClaudeUsage;
}

// ============= Streaming Types =============

export type ClaudeStreamEvent =
  | ClaudeMessageStartEvent
  | ClaudeMessageDeltaEvent
  | ClaudeMessageStopEvent
  | ClaudeContentBlockStartEvent
  | ClaudeContentBlockDeltaEvent
  | ClaudeContentBlockStopEvent
  | ClaudePingEvent
  | ClaudeErrorEvent;

export interface ClaudeMessageStartEvent {
  type: 'message_start';
  message: {
    id: string;
    type: 'message';
    role: 'assistant';
    content: [];
    model: string;
    stop_reason: null;
    stop_sequence: null;
    usage: ClaudeUsage;
  };
}

export interface ClaudeMessageDeltaEvent {
  type: 'message_delta';
  delta: {
    stop_reason: ClaudeStopReason | null;
    stop_sequence: string | null;
  };
  usage: {
    output_tokens: number;
  };
}

export interface ClaudeMessageStopEvent {
  type: 'message_stop';
}

export interface ClaudeContentBlockStartEvent {
  type: 'content_block_start';
  index: number;
  content_block:
    | { type: 'text'; text: '' }
    | { type: 'thinking'; thinking: '' }
    | { type: 'tool_use'; id: string; name: string; input: {} };
}

export interface ClaudeContentBlockDeltaEvent {
  type: 'content_block_delta';
  index: number;
  delta:
    | { type: 'text_delta'; text: string }
    | { type: 'thinking_delta'; thinking: string }
    | { type: 'input_json_delta'; partial_json: string };
}

export interface ClaudeContentBlockStopEvent {
  type: 'content_block_stop';
  index: number;
}

export interface ClaudePingEvent {
  type: 'ping';
}

export interface ClaudeErrorEvent {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

// ============= Token Counting Types =============

export interface ClaudeCountTokensRequest {
  model: string;
  messages?: ClaudeMessage[];
  system?: string | ClaudeContentBlock[];
  tools?: ClaudeTool[];
  tool_choice?: ClaudeToolChoice;
}

export interface ClaudeCountTokensResponse {
  input_tokens: number;
}

// ============= Error Types =============

export interface ClaudeErrorResponse {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}
