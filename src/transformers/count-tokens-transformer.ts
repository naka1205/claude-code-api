/**
 * Token counting transformation between Claude and Gemini
 */

import type {
  ClaudeCountTokensRequest,
  ClaudeCountTokensResponse,
} from '../types/claude';
import type {
  GeminiCountTokensRequest,
  GeminiCountTokensResponse,
} from '../types/gemini';
import { transformRequestToGemini } from './request-transformer';

/**
 * Transform Claude count tokens request to Gemini count tokens request
 */
export function transformCountTokensRequestToGemini(
  request: ClaudeCountTokensRequest
): GeminiCountTokensRequest {
  // Create a minimal messages request to reuse the transformation logic
  const messagesRequest = {
    model: request.model,
    max_tokens: 1, // Not used for token counting
    messages: request.messages || [],
    system: request.system,
    tools: request.tools,
    tool_choice: request.tool_choice,
  };

  // Transform to Gemini format
  const geminiRequest = transformRequestToGemini(messagesRequest);

  return {
    contents: geminiRequest.contents,
    systemInstruction: geminiRequest.systemInstruction,
    tools: geminiRequest.tools,
    toolConfig: geminiRequest.toolConfig,
  };
}

/**
 * Transform Gemini count tokens response to Claude count tokens response
 */
export function transformCountTokensResponseToClaude(
  response: GeminiCountTokensResponse
): ClaudeCountTokensResponse {
  return {
    input_tokens: response.totalTokens,
  };
}
