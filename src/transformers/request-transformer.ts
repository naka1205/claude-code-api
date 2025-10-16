/**
 * Request transformation from Claude to Gemini format
 */

import type { ClaudeMessagesRequest, ClaudeMessage } from '../types/claude';
import type {
  GeminiGenerateContentRequest,
  GeminiContent,
  GeminiGenerationConfig,
} from '../types/gemini';
import { transformContentBlocksToGemini } from './content-transformer';
import {
  transformToolsToGemini,
  transformToolChoiceToGemini,
  clearToolIdMapping,
} from './tool-transformer';
import { transformThinkingConfigToGemini } from './thinking-transformer';
import { getGeminiModel } from '../models';

/**
 * Transform Claude messages request to Gemini generate content request
 */
export function transformRequestToGemini(
  claudeRequest: ClaudeMessagesRequest
): GeminiGenerateContentRequest {
  try {
    clearToolIdMapping();

    const { messages, system, tools, tool_choice, thinking, ...config } = claudeRequest;

    const contents: GeminiContent[] = transformMessagesToGemini(messages);

    const generationConfig: GeminiGenerationConfig = {
      maxOutputTokens: config.max_tokens,
    };

    const geminiModel = getGeminiModel(claudeRequest.model);
    const thinkingConfig = transformThinkingConfigToGemini(thinking, geminiModel);
    const hasThinking = thinking?.type === 'enabled';

    if (!hasThinking && config.temperature !== undefined) {
      generationConfig.temperature = config.temperature;
    }

    if (config.top_p !== undefined) {
      generationConfig.topP = config.top_p;
    }

    if (!hasThinking && config.top_k !== undefined) {
      generationConfig.topK = config.top_k;
    }

    if (config.stop_sequences && config.stop_sequences.length > 0) {
      generationConfig.stopSequences = config.stop_sequences;
    }

    if (thinkingConfig) {
      generationConfig.thinkingConfig = thinkingConfig;
    }

    // Build the request
    const geminiRequest: GeminiGenerateContentRequest = {
      contents,
      generationConfig,
    };

    // Add system instruction if present
    if (system) {
      geminiRequest.systemInstruction = {
        parts: typeof system === 'string' ? [{ text: system }] : transformContentBlocksToGemini(system),
      };
    }

    // Add tools if present
    if (tools && tools.length > 0) {
      geminiRequest.tools = transformToolsToGemini(tools);
      geminiRequest.toolConfig = transformToolChoiceToGemini(tool_choice);
    }

    return geminiRequest;
  } catch (error) {
    console.error('[RequestTransformer] transformRequestToGemini failed:', error);
    throw error;
  }
}

/**
 * Transform Claude messages to Gemini contents
 */
function transformMessagesToGemini(messages: ClaudeMessage[]): GeminiContent[] {
  return messages.map((message) => ({
    role: message.role === 'user' ? 'user' : 'model',
    parts: transformContentBlocksToGemini(message.content),
  }));
}
