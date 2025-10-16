/**
 * Common types used across the application
 */

export interface Env {
  // Cloudflare KV namespace
  KV?: KVNamespace;

  // Environment variables
  GEMINI_API_KEY?: string;
  GEMINI_BASE_URL?: string;
  GEMINI_API_VERSION?: string;
  ALLOWED_ORIGINS?: string;
  ENABLE_LOGGING?: string;
}

export interface RequestContext {
  requestId: string;
  timestamp: number;
  apiKey: string;
  apiKeys: string[];
  env: Env;
}

export interface TransformContext {
  requestId: string;
  isStreaming: boolean;
  hasTools: boolean;
  hasThinking: boolean;
}

export interface ApiError {
  type: string;
  message: string;
  status?: number;
}

export interface StreamState {
  messageId: string;
  model: string;
  contentBlocks: any[];
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}
