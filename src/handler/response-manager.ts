/**
 * Response processing and formatting
 */

import type { ClaudeMessagesResponse, ClaudeCountTokensResponse } from '../types/claude';
import type { GeminiGenerateContentResponse, GeminiCountTokensResponse } from '../types/gemini';
import { transformResponseToClaude } from '../transformers/response-transformer';
import { transformCountTokensResponseToClaude } from '../transformers/count-tokens-transformer';
import { logger } from '../utils/logger';

export class ResponseManager {
  /**
   * Process messages response
   */
  processMessagesResponse(
    geminiResponse: GeminiGenerateContentResponse,
    claudeModel: string,
    requestId?: string
  ): ClaudeMessagesResponse {
    logger.debug('Processing messages response', { requestId, model: claudeModel });

    try {
      const claudeResponse = transformResponseToClaude(geminiResponse, claudeModel);

      logger.info('Messages response processed', {
        requestId,
        stopReason: claudeResponse.stop_reason,
        inputTokens: claudeResponse.usage.input_tokens,
        outputTokens: claudeResponse.usage.output_tokens,
      });

      return claudeResponse;
    } catch (error) {
      logger.error('Failed to process messages response', error, { requestId });
      throw error;
    }
  }

  /**
   * Process count tokens response
   */
  processCountTokensResponse(
    geminiResponse: GeminiCountTokensResponse,
    requestId?: string
  ): ClaudeCountTokensResponse {
    logger.debug('Processing count tokens response', { requestId });

    try {
      const claudeResponse = transformCountTokensResponseToClaude(geminiResponse);

      logger.info('Count tokens response processed', {
        requestId,
        tokens: claudeResponse.input_tokens,
      });

      return claudeResponse;
    } catch (error) {
      logger.error('Failed to process count tokens response', error, { requestId });
      throw error;
    }
  }
}

// Singleton instance
export const responseManager = new ResponseManager();
