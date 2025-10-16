/**
 * Content block transformation logic between Claude and Gemini formats
 */

import type {
  ClaudeContentBlock,
  ClaudeTextBlock,
  ClaudeImageBlock,
} from '../types/claude';
import type { GeminiPart, GeminiContent } from '../types/gemini';
import { transformToolUseToGemini, transformToolResultToGemini, registerToolUse } from './tool-transformer';
import { transformThinkingToGemini } from './thinking-transformer';
import { generateToolId } from '../utils/common';

/**
 * Filter out system-reminder tags from text
 */
function filterSystemReminders(text: string): string {
  return text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
}

/**
 * Transform Claude content blocks to Gemini parts
 */
export function transformContentBlocksToGemini(
  content: string | ClaudeContentBlock[]
): GeminiPart[] {
  if (typeof content === 'string') {
    const filteredText = filterSystemReminders(content);
    return filteredText ? [{ text: filteredText }] : [];
  }

  const parts: GeminiPart[] = [];

  for (const block of content) {
    try {
      if ('cache_control' in block) {
        const { cache_control, ...cleanBlock } = block as any;
        switch (cleanBlock.type) {
          case 'text':
            const filteredText = filterSystemReminders(cleanBlock.text);
            if (filteredText) {
              parts.push({ text: filteredText });
            }
            break;
          case 'image':
            parts.push(transformImageBlockToGemini(cleanBlock));
            break;
          case 'tool_use':
            registerToolUse(cleanBlock.id, cleanBlock.name);
            parts.push(transformToolUseToGemini(cleanBlock));
            break;
          case 'tool_result':
            parts.push(transformToolResultToGemini(cleanBlock));
            break;
          case 'thinking':
            parts.push(transformThinkingToGemini(cleanBlock));
            break;
          default:
            console.error('[ContentTransformer] Unknown content block type:', cleanBlock.type);
        }
      } else {
        switch (block.type) {
          case 'text':
            const filteredText = filterSystemReminders(block.text);
            if (filteredText) {
              parts.push({ text: filteredText });
            }
            break;
          case 'image':
            parts.push(transformImageBlockToGemini(block));
            break;
          case 'tool_use':
            registerToolUse(block.id, block.name);
            parts.push(transformToolUseToGemini(block));
            break;
          case 'tool_result':
            parts.push(transformToolResultToGemini(block));
            break;
          case 'thinking':
            parts.push(transformThinkingToGemini(block));
            break;
          default:
            console.error('[ContentTransformer] Unknown content block type:', (block as any).type);
        }
      }
    } catch (error) {
      console.error('[ContentTransformer] Failed to transform content block:', { block, error });
      throw error;
    }
  }

  return parts;
}

/**
 * Transform Claude image block to Gemini inline data
 */
function transformImageBlockToGemini(image: ClaudeImageBlock): GeminiPart {
  if (image.source.type === 'base64') {
    return {
      inlineData: {
        mimeType: image.source.media_type || 'image/jpeg',
        data: image.source.data!,
      },
    };
  }

  // For URL type, we would need to fetch and convert to base64
  // For simplicity, we'll include it as text with a note
  // In production, you might want to fetch the image
  if (image.source.type === 'url') {
    // Gemini doesn't support URL images directly in the same way
    // You would need to fetch and convert to base64
    // For now, return a text placeholder
    return {
      text: `[Image from URL: ${image.source.url}]`,
    };
  }

  throw new Error(`Unsupported image source type: ${image.source.type}`);
}

/**
 * Transform Gemini parts to Claude content blocks
 */
export function transformGeminiPartsToClaude(parts: GeminiPart[]): ClaudeContentBlock[] {
  const blocks: ClaudeContentBlock[] = [];

  for (const part of parts) {
    if ('text' in part) {
      blocks.push({
        type: 'text',
        text: part.text,
      });
    } else if ('inlineData' in part) {
      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: part.inlineData.mimeType,
          data: part.inlineData.data,
        },
      });
    } else if ('functionCall' in part) {
      blocks.push({
        type: 'tool_use',
        id: generateToolId(),
        name: part.functionCall.name,
        input: part.functionCall.args,
      });
    } else if ('thought' in part) {
      blocks.push({
        type: 'thinking',
        thinking: part.thought.content,
      });
    }
  }

  return blocks;
}
