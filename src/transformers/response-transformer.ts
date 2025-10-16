/**
 * Response transformation from Gemini to Claude format
 */

import type {
  ClaudeMessagesResponse,
  ClaudeStopReason,
  ClaudeUsage,
} from '../types/claude';
import type {
  GeminiGenerateContentResponse,
  GeminiFinishReason,
} from '../types/gemini';
import { transformGeminiPartsToClaude } from './content-transformer';
import { generateMessageId } from '../utils/common';

/**
 * Transform Gemini response to Claude messages response
 */
export function transformResponseToClaude(
  geminiResponse: GeminiGenerateContentResponse,
  requestModel: string
): ClaudeMessagesResponse {
  try {
    if (!geminiResponse.candidates || geminiResponse.candidates.length === 0) {
      const error = new Error('No candidates found in Gemini response');
      console.error('[ResponseTransformer] transformResponseToClaude failed:', { geminiResponse, error });
      throw error;
    }

    const candidate = geminiResponse.candidates[0];

    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
      console.warn('[ResponseTransformer] Empty content in candidate, returning empty response');
      return {
        id: generateMessageId(),
        type: 'message',
        role: 'assistant',
        content: [],
        model: requestModel,
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: transformUsageToClaude(geminiResponse.usageMetadata),
      };
    }

    const content = transformGeminiPartsToClaude(candidate.content.parts);

    const stopReason = transformStopReasonToClaude(candidate.finishReason);

    const usage = transformUsageToClaude(geminiResponse.usageMetadata);

    return {
      id: generateMessageId(),
      type: 'message',
      role: 'assistant',
      content,
      model: requestModel,
      stop_reason: stopReason,
      stop_sequence: null,
      usage,
    };
  } catch (error) {
    console.error('[ResponseTransformer] transformResponseToClaude exception:', error);
    throw error;
  }
}

/**
 * Transform Gemini finish reason to Claude stop reason
 */
function transformStopReasonToClaude(
  finishReason?: GeminiFinishReason
): ClaudeStopReason | null {
  if (!finishReason) {
    return 'end_turn';
  }

  switch (finishReason) {
    case 'STOP':
      return 'end_turn';
    case 'MAX_TOKENS':
      return 'max_tokens';
    case 'SAFETY':
    case 'RECITATION':
    case 'PROHIBITED_CONTENT':
    case 'SPII':
      return 'refusal';
    default:
      return 'end_turn';
  }
}

/**
 * Transform Gemini usage metadata to Claude usage
 */
function transformUsageToClaude(
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
    cachedContentTokenCount?: number;
  }
): ClaudeUsage {
  if (!usageMetadata) {
    return {
      input_tokens: 0,
      output_tokens: 0,
    };
  }

  const usage: ClaudeUsage = {
    input_tokens: usageMetadata.promptTokenCount || 0,
    output_tokens: usageMetadata.candidatesTokenCount || 0,
  };

  if (usageMetadata.cachedContentTokenCount) {
    usage.cache_read_input_tokens = usageMetadata.cachedContentTokenCount;
  }

  return usage;
}
