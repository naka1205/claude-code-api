/**
 * Request validation and normalization
 */

import type { ClaudeMessagesRequest, ClaudeCountTokensRequest } from '../types/claude';
import { LIMITS } from '../utils/constants';
import { shouldIncludeThinking } from '../transformers/thinking-transformer';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

function extractBetaFlags(headers: any): string[] {
  const betaHeader = headers?.['anthropic-beta'];
  if (typeof betaHeader === 'string') {
    return betaHeader.split(',').map(s => s.trim());
  }
  return [];
}

/**
 * Validate messages request
 */
export function validateMessagesRequest(request: any): ValidationResult {
  // Check required fields
  if (!request.model) {
    return { valid: false, error: 'Missing required field: model' };
  }

  if (!request.messages) {
    return { valid: false, error: 'Missing required field: messages' };
  }

  if (!Array.isArray(request.messages)) {
    return { valid: false, error: 'Field messages must be an array' };
  }

  if (request.messages.length === 0) {
    return { valid: false, error: 'Field messages cannot be empty' };
  }

  if (request.messages.length > LIMITS.MAX_MESSAGES) {
    return { valid: false, error: `Too many messages (max ${LIMITS.MAX_MESSAGES})` };
  }

  if (request.max_tokens === undefined) {
    return { valid: false, error: 'Missing required field: max_tokens' };
  }

  if (typeof request.max_tokens !== 'number') {
    return { valid: false, error: 'Field max_tokens must be a number' };
  }

  if (request.max_tokens < LIMITS.MAX_TOKENS_MIN) {
    return { valid: false, error: `Field max_tokens must be >= ${LIMITS.MAX_TOKENS_MIN}` };
  }

  // Validate temperature if present
  if (request.temperature !== undefined) {
    if (typeof request.temperature !== 'number') {
      return { valid: false, error: 'Field temperature must be a number' };
    }
    if (request.temperature < LIMITS.MIN_TEMPERATURE || request.temperature > LIMITS.MAX_TEMPERATURE) {
      return { valid: false, error: `Field temperature must be between ${LIMITS.MIN_TEMPERATURE} and ${LIMITS.MAX_TEMPERATURE}` };
    }
  }

  // Validate top_p if present
  if (request.top_p !== undefined) {
    if (typeof request.top_p !== 'number') {
      return { valid: false, error: 'Field top_p must be a number' };
    }
    if (request.top_p < LIMITS.MIN_TOP_P || request.top_p > LIMITS.MAX_TOP_P) {
      return { valid: false, error: `Field top_p must be between ${LIMITS.MIN_TOP_P} and ${LIMITS.MAX_TOP_P}` };
    }
  }

  // Validate top_k if present
  if (request.top_k !== undefined) {
    if (typeof request.top_k !== 'number') {
      return { valid: false, error: 'Field top_k must be a number' };
    }
    if (request.top_k < LIMITS.MIN_TOP_K) {
      return { valid: false, error: `Field top_k must be >= ${LIMITS.MIN_TOP_K}` };
    }
  }

  // Validate messages format
  for (let i = 0; i < request.messages.length; i++) {
    const message = request.messages[i];

    if (!message.role) {
      return { valid: false, error: `Message at index ${i} missing role` };
    }

    if (message.role !== 'user' && message.role !== 'assistant') {
      return { valid: false, error: `Message at index ${i} has invalid role: ${message.role}` };
    }

    if (!message.content) {
      return { valid: false, error: `Message at index ${i} missing content` };
    }
  }

  // Validate thinking config constraints (Extended Thinking limitations)
  if (request.thinking?.type === 'enabled') {
    // Cannot be used with forced tool use
    if (request.tool_choice?.type === 'tool') {
      return {
        valid: false,
        error: 'Extended thinking cannot be used with forced tool use (tool_choice.type="tool")'
      };
    }

    // max_tokens > 21333 requires streaming
    if (request.max_tokens > 21333 && !request.stream) {
      return {
        valid: false,
        error: 'Extended thinking with max_tokens > 21333 requires stream=true'
      };
    }
  }

  return { valid: true };
}

/**
 * Validate count tokens request
 */
export function validateCountTokensRequest(request: any): ValidationResult {
  if (!request.model) {
    return { valid: false, error: 'Missing required field: model' };
  }

  return { valid: true };
}

/**
 * Normalize messages request (apply defaults)
 */
export function normalizeMessagesRequest(request: ClaudeMessagesRequest): ClaudeMessagesRequest {
  return {
    ...request,
    stream: request.stream ?? false,
    temperature: request.temperature,
    top_p: request.top_p,
    top_k: request.top_k,
  };
}
