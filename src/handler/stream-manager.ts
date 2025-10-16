/**
 * SSE streaming manager
 */

import type { ClaudeStreamEvent } from '../types/claude';
import type { GeminiStreamChunk } from '../types/gemini';
import { StreamTransformer, formatSSE } from '../transformers/stream-transformer';
import { logger } from '../utils/logger';
import { logGeminiStreamChunk, logClaudeStreamEvent } from '../utils/request-logger';
import { shouldIncludeThinking } from '../transformers/thinking-transformer';

export class StreamManager {
  async streamResponse(
    geminiStream: AsyncGenerator<GeminiStreamChunk>,
    claudeModel: string,
    writer: WritableStreamDefaultWriter<Uint8Array>,
    requestId?: string,
    requestThinking?: any,
    betaFlags?: string[]
  ): Promise<void> {
    const encoder = new TextEncoder();
    const exposeThinking = shouldIncludeThinking(requestThinking, betaFlags);
    const transformer = new StreamTransformer(claudeModel, exposeThinking);

    try {
      logger.info('Starting stream processing', { requestId, model: claudeModel, exposeThinking });

      let chunkCount = 0;

      for await (const chunk of geminiStream) {
        chunkCount++;
        logger.debug(`Processing stream chunk ${chunkCount}`, { requestId });

        if (requestId) {
          logGeminiStreamChunk(requestId, chunk);
        }

        const events = transformer.transformChunk(chunk);

        for (const event of events) {
          if (requestId) {
            logClaudeStreamEvent(requestId, event);
          }

          const sseMessage = formatSSE(event);
          await writer.write(encoder.encode(sseMessage));
        }
      }

      const stopEvent = transformer.createMessageStopEvent();
      await writer.write(encoder.encode(formatSSE(stopEvent)));

      logger.info('Stream completed successfully', {
        requestId,
        totalChunks: chunkCount,
      });

      await writer.close();
    } catch (error) {
      logger.error('Stream processing failed', error, { requestId });

      try {
        const errorEvent: ClaudeStreamEvent = {
          type: 'error',
          error: {
            type: 'api_error',
            message: (error as Error).message || 'Stream processing failed',
          },
        };
        await writer.write(encoder.encode(formatSSE(errorEvent)));
        await writer.close();
      } catch (writeError) {
        logger.error('Failed to send error event', writeError, { requestId });
      }

      throw error;
    }
  }

  /**
   * Create SSE stream response
   */
  createStreamResponse(): { response: Response; writer: WritableStreamDefaultWriter<Uint8Array> } {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    const response = new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

    return { response, writer };
  }
}

// Singleton instance
export const streamManager = new StreamManager();
