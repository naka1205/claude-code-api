/**
 * Thinking/reasoning transformation logic between Claude and Gemini formats
 */

import type {
  ClaudeThinkingBlock,
  ClaudeThinkingConfig,
} from '../types/claude';
import type {
  GeminiThoughtPart,
  GeminiThinkingConfig,
} from '../types/gemini';

/**
 * Transform Claude thinking config to Gemini thinking config
 * Handles model-specific budget limits
 */
export function transformThinkingConfigToGemini(
  thinkingConfig?: ClaudeThinkingConfig,
  geminiModel?: string
): GeminiThinkingConfig | undefined {
  if (!thinkingConfig || geminiModel?.includes('2.0')) {
    return undefined;
  }

  if (thinkingConfig.type === 'disabled') {
    return { thinkingBudget: 0 };
  }

  if (thinkingConfig.type === 'enabled') {
    if (thinkingConfig.budget_tokens !== undefined) {
      let budget = thinkingConfig.budget_tokens;

      if (geminiModel?.includes('2.5-flash')) {
        budget = -1;
      } else if (geminiModel?.includes('2.5-pro')) {
        budget = Math.min(budget, 32768);
        budget = Math.max(budget, 128);
      }

      return { thinkingBudget: budget };
    }
    return { thinkingBudget: -1 };
  }

  return undefined;
}

/**
 * Transform Claude thinking block to Gemini thought part
 */
export function transformThinkingToGemini(
  thinking: ClaudeThinkingBlock
): GeminiThoughtPart {
  const thoughtPart: GeminiThoughtPart = {
    thought: {
      content: thinking.thinking,
      redacted: false,
    },
  };

  if (thinking.signature) {
    thoughtPart.thoughtSignature = thinking.signature;
  }

  return thoughtPart;
}

export function transformThoughtToClaude(
  thought: GeminiThoughtPart
): ClaudeThinkingBlock {
  const thinkingBlock: ClaudeThinkingBlock = {
    type: 'thinking',
    thinking: thought.thought.content,
  };

  if (thought.thoughtSignature) {
    thinkingBlock.signature = thought.thoughtSignature;
  }

  return thinkingBlock;
}

/**
 * Check if thinking should be included in response
 * Based on the request configuration and beta flags
 */
export function shouldIncludeThinking(
  requestThinking?: ClaudeThinkingConfig,
  betaFlags?: string[]
): boolean {
  if (requestThinking?.type === 'enabled') {
    return true;
  }

  if (betaFlags?.some(flag =>
    flag.includes('interleaved-thinking') ||
    flag.includes('claude-code')
  )) {
    return true;
  }

  return false;
}
