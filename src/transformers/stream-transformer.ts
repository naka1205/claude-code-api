/**
 * Stream transformation from Gemini SSE format to Claude SSE format
 */

import type {
  ClaudeStreamEvent,
  ClaudeContentBlock,
  ClaudeStopReason,
} from '../types/claude';
import type { GeminiStreamChunk, GeminiPart } from '../types/gemini';
import { transformGeminiPartsToClaude } from './content-transformer';
import { generateRandomId } from '../utils/common';

/**
 * State management for streaming transformation
 */
export class StreamTransformer {
  private messageId: string;
  private model: string;
  private contentBlocks: ClaudeContentBlock[] = [];
  private contentBlocksStarted: Set<number> = new Set();
  private inputTokens: number = 0;
  private outputTokens: number = 0;
  private hasStarted: boolean = false;
  private exposeThinkingToClient: boolean;
  private hasHiddenThinking: boolean = false;

  constructor(model: string, exposeThinkingToClient: boolean = false) {
    this.messageId = `msg_${generateRandomId()}`;
    this.model = model;
    this.exposeThinkingToClient = exposeThinkingToClient;
  }

  /**
   * Transform Gemini stream chunk to Claude stream events
   */
  transformChunk(chunk: GeminiStreamChunk): ClaudeStreamEvent[] {
    const events: ClaudeStreamEvent[] = [];

    if (!this.hasStarted) {
      events.push(this.createMessageStartEvent());
      this.hasStarted = true;
    }

    if (chunk.candidates && chunk.candidates.length > 0) {
      const candidate = chunk.candidates[0];

      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        const filteredParts = this.exposeThinkingToClient
          ? candidate.content.parts
          : candidate.content.parts.filter(part => !('thought' in part));

        if (!this.exposeThinkingToClient && candidate.content.parts.some(part => 'thought' in part)) {
          this.hasHiddenThinking = true;
        }

        for (let i = 0; i < filteredParts.length; i++) {
          const part = filteredParts[i];
          const blockIndex = i;

          if (!this.contentBlocksStarted.has(blockIndex)) {
            events.push(this.createContentBlockStartEvent(part, blockIndex));
            this.contentBlocksStarted.add(blockIndex);
          }

          const deltaEvent = this.createContentBlockDeltaEvent(part, blockIndex);
          if (deltaEvent) {
            events.push(deltaEvent);
          }
        }

        const newBlocks = transformGeminiPartsToClaude(filteredParts);
        this.contentBlocks = this.mergeContentBlocks(this.contentBlocks, newBlocks);
      }

      if (candidate.finishReason) {
        for (let i = 0; i < this.contentBlocks.length; i++) {
          events.push(this.createContentBlockStopEvent(i));
        }

        events.push(this.createMessageDeltaEvent(candidate.finishReason));
      }
    }

    if (chunk.usageMetadata) {
      this.inputTokens = chunk.usageMetadata.promptTokenCount || 0;
      this.outputTokens = chunk.usageMetadata.candidatesTokenCount || 0;
    }

    return events;
  }

  /**
   * Create final message_stop event
   */
  createMessageStopEvent(): ClaudeStreamEvent {
    return {
      type: 'message_stop',
    };
  }

  private createMessageStartEvent(): ClaudeStreamEvent {
    return {
      type: 'message_start',
      message: {
        id: this.messageId,
        type: 'message',
        role: 'assistant',
        content: [],
        model: this.model,
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: this.inputTokens,
          output_tokens: 0,
        },
      },
    };
  }

  private createContentBlockStartEvent(part: GeminiPart, index: number): ClaudeStreamEvent {
    let contentBlock: any;

    if ('text' in part) {
      contentBlock = { type: 'text', text: '' };
    } else if ('thought' in part && this.exposeThinkingToClient) {
      contentBlock = { type: 'thinking', thinking: '' };
    } else if ('functionCall' in part) {
      contentBlock = {
        type: 'tool_use',
        id: `toolu_${generateRandomId()}`,
        name: part.functionCall.name,
        input: {},
      };
    } else {
      contentBlock = { type: 'text', text: '' };
    }

    return {
      type: 'content_block_start',
      index,
      content_block: contentBlock,
    };
  }

  private createContentBlockDeltaEvent(
    part: GeminiPart,
    index: number
  ): ClaudeStreamEvent | null {
    if ('text' in part && part.text) {
      return {
        type: 'content_block_delta',
        index,
        delta: { type: 'text_delta', text: part.text },
      };
    }

    if ('thought' in part && part.thought.content && this.exposeThinkingToClient) {
      return {
        type: 'content_block_delta',
        index,
        delta: { type: 'thinking_delta', thinking: part.thought.content },
      };
    }

    if ('functionCall' in part) {
      return {
        type: 'content_block_delta',
        index,
        delta: {
          type: 'input_json_delta',
          partial_json: JSON.stringify(part.functionCall.args),
        },
      };
    }

    return null;
  }

  private createContentBlockStopEvent(index: number): ClaudeStreamEvent {
    return {
      type: 'content_block_stop',
      index,
    };
  }

  private createMessageDeltaEvent(finishReason: string): ClaudeStreamEvent {
    const stopReason = this.transformStopReason(finishReason);

    return {
      type: 'message_delta',
      delta: {
        stop_reason: stopReason,
        stop_sequence: null,
      },
      usage: {
        output_tokens: this.outputTokens,
      },
    };
  }

  private transformStopReason(finishReason: string): ClaudeStopReason {
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

  private mergeContentBlocks(
    existing: ClaudeContentBlock[],
    newBlocks: ClaudeContentBlock[]
  ): ClaudeContentBlock[] {
    const merged = [...existing];

    for (let i = 0; i < newBlocks.length; i++) {
      if (i < merged.length) {
        // Merge with existing block
        const existingBlock = merged[i];
        const newBlock = newBlocks[i];

        if (existingBlock.type === 'text' && newBlock.type === 'text') {
          (existingBlock as any).text += (newBlock as any).text;
        } else if (existingBlock.type === 'thinking' && newBlock.type === 'thinking') {
          (existingBlock as any).thinking += (newBlock as any).thinking;
        } else {
          merged[i] = newBlock;
        }
      } else {
        // Add new block
        merged.push(newBlocks[i]);
      }
    }

    return merged;
  }
}

/**
 * Format Claude stream event as SSE message
 */
export function formatSSE(event: ClaudeStreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
