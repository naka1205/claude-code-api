/**
 * Tool transformation logic between Claude and Gemini formats
 */

import type {
  ClaudeTool,
  ClaudeToolChoice,
  ClaudeToolUseBlock,
  ClaudeToolResultBlock,
} from '../types/claude';
import type {
  GeminiTool,
  GeminiToolConfig,
  GeminiFunctionCallPart,
  GeminiFunctionResponsePart,
} from '../types/gemini';
import { generateToolId } from '../utils/common';

/**
 * Clean schema by removing Gemini-unsupported fields
 */
function cleanSchema(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(cleanSchema);
  }

  const cleaned: any = {};
  for (const key in obj) {
    if (key === 'additionalProperties' || key === '$schema') {
      continue;
    }
    cleaned[key] = cleanSchema(obj[key]);
  }
  return cleaned;
}

/**
 * Clean tool description by removing misleading examples
 * Removes example agents that are not actually available (like greeting-responder)
 */
function cleanToolDescription(description: string): string {
  const original = description;

  const cleaned = description
    .replace(/<example_agent_descriptions>[\s\S]*?<\/example_agent_descriptions?>/g, '')
    .replace(/<example>\s*user:\s*["']Hello["'][\s\S]*?<\/example>/g, '')
    .replace(/\n\n\n+/g, '\n\n')
    .trim();

  if (original !== cleaned) {
    console.log('[ToolTransformer] Removed misleading examples from tool description');
  }

  return cleaned;
}

/**
 * Transform Claude tools to Gemini function declarations
 */
export function transformToolsToGemini(claudeTools: ClaudeTool[]): GeminiTool[] {
  if (!claudeTools || claudeTools.length === 0) {
    return [];
  }

  return [
    {
      functionDeclarations: claudeTools.map((tool) => ({
        name: tool.name,
        description: cleanToolDescription(tool.description),
        parameters: cleanSchema({
          type: 'object' as const,
          properties: tool.input_schema.properties,
          required: tool.input_schema.required,
        }),
      })),
    },
  ];
}

/**
 * Transform Claude tool choice to Gemini tool config
 */
export function transformToolChoiceToGemini(
  toolChoice?: ClaudeToolChoice
): GeminiToolConfig | undefined {
  if (!toolChoice) {
    return { functionCallingConfig: { mode: 'AUTO' } };
  }

  if (toolChoice.type === 'auto') {
    return { functionCallingConfig: { mode: 'AUTO' } };
  }

  if (toolChoice.type === 'any') {
    return { functionCallingConfig: { mode: 'ANY' } };
  }

  if (toolChoice.type === 'tool') {
    return {
      functionCallingConfig: {
        mode: 'ANY',
        allowedFunctionNames: [toolChoice.name],
      },
    };
  }

  return undefined;
}

/**
 * Transform Claude tool_use block to Gemini function call
 */
export function transformToolUseToGemini(
  toolUse: ClaudeToolUseBlock
): GeminiFunctionCallPart {
  return {
    functionCall: {
      name: toolUse.name,
      args: toolUse.input,
    },
  };
}

/**
 * Map to store tool_use_id -> function name mapping
 * This is needed because Gemini requires the function name in functionResponse
 */
const toolIdToNameMap = new Map<string, string>();

/**
 * Register a tool use ID with its function name
 */
export function registerToolUse(toolUseId: string, functionName: string): void {
  toolIdToNameMap.set(toolUseId, functionName);
}

/**
 * Get function name from tool use ID
 */
export function getFunctionNameFromToolUseId(toolUseId: string): string | undefined {
  return toolIdToNameMap.get(toolUseId);
}

/**
 * Clear tool ID mapping (call when starting a new request)
 */
export function clearToolIdMapping(): void {
  toolIdToNameMap.clear();
}

/**
 * Transform Claude tool_result block to Gemini function response
 */
export function transformToolResultToGemini(
  toolResult: ClaudeToolResultBlock
): GeminiFunctionResponsePart {
  let responseContent: any = {};

  if (typeof toolResult.content === 'string') {
    responseContent = { result: toolResult.content };
  } else if (Array.isArray(toolResult.content)) {
    const textParts = toolResult.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as any).text)
      .join('\n');
    responseContent = { result: textParts || '' };
  }

  if (toolResult.is_error) {
    responseContent.error = true;
  }

  const functionName = getFunctionNameFromToolUseId(toolResult.tool_use_id);
  if (!functionName) {
    console.warn(`[ToolTransformer] No function name found for tool_use_id: ${toolResult.tool_use_id}`);
  }

  return {
    functionResponse: {
      name: functionName || toolResult.tool_use_id,
      response: responseContent,
    },
  };
}

/**
 * Transform Gemini function call to Claude tool_use block
 */
export function transformFunctionCallToClaude(
  functionCall: GeminiFunctionCallPart,
  index: number
): ClaudeToolUseBlock {
  return {
    type: 'tool_use',
    id: generateToolId(),
    name: functionCall.functionCall.name,
    input: functionCall.functionCall.args,
  };
}
