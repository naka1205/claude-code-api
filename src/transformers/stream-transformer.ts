/**
 * 流式响应转换器 - Cloudflare Workers版本
 * 处理SSE流式响应的转换
 */

import {
  ClaudeStreamEvent,
  ClaudeResponse,
  ClaudeContentBlock,
  ClaudeTextBlock,
  ClaudeThinkingBlock
} from '../types/claude';
import { GeminiStreamResponse, GeminiPart } from '../types/gemini';
import { ToolTransformer } from './tool-transformer';
import { ThinkingTransformer } from './thinking-transformer';

interface StreamBuffer {
  textContent: string;
  functionCalls: Array<{ name: string; args: any; id: string }>;
  functionResponses: Array<{ name: string; response: any; callId: string }>;
  thinkingContent?: string;
}

/**
 * 流状态管理器 - 恢复自Node.js版本
 * 提供完整的去重和增量检测功能
 */
class StreamStateManager {
  public processedFunctionCalls: Map<string, string> = new Map();
  private processedTextHashes: Set<string> = new Set();
  private lastTextContent: string = '';
  private buffer: StreamBuffer = {
    textContent: '',
    functionCalls: [],
    functionResponses: [],
    thinkingContent: ''
  };

  /**
   * 处理增量文本 - 修复重复响应问题
   */
  processIncrementalText(text: string): string | null {
    if (!text) return null;

    

    // 检查是否为累积文本（包含之前的内容）
    if (this.lastTextContent && text.startsWith(this.lastTextContent)) {
      // 提取增量部分
      const incrementalText = text.substring(this.lastTextContent.length);

      if (!incrementalText) {
        return null;
      }

      this.lastTextContent = text;
      this.buffer.textContent += incrementalText;
      return incrementalText;
    }

    // 检查是否为完全相同的文本（避免重复）
    if (this.lastTextContent === text) {
      return null;
    }

    // 新的文本内容或真正的增量文本
    
    this.lastTextContent = text;
    this.buffer.textContent += text;
    return text;
  }

  /**
   * 检查并处理函数调用去重
   */
  isDuplicateFunctionCall(functionCall: { name: string; args: any }): boolean {
    const signature = this.generateFunctionSignature(functionCall);
    const isDuplicate = this.processedFunctionCalls.has(signature);
    console.log(`[StreamDebug] Checking duplicate for ${functionCall.name}:`, {
      signature,
      isDuplicate,
      existingSignatures: Array.from(this.processedFunctionCalls.keys())
    });
    return isDuplicate;
  }

  /**
   * 记录函数调用
   */
  recordFunctionCall(functionCall: { name: string; args: any }): string {
    const signature = this.generateFunctionSignature(functionCall);
    const toolUseId = this.generateToolUseId();
    this.processedFunctionCalls.set(signature, toolUseId);

    this.buffer.functionCalls.push({
      name: functionCall.name,
      args: functionCall.args || {},
      id: toolUseId
    });

    console.log(`[StreamDebug] Recorded function call:`, {
      name: functionCall.name,
      signature,
      toolUseId,
      totalProcessed: this.processedFunctionCalls.size
    });

    return toolUseId;
  }

  /**
   * 生成函数签名
   */
  generateFunctionSignature(functionCall: { name: string; args: any }): string {
    const argsStr = JSON.stringify(functionCall.args || {});
    const content = `${functionCall.name}:${argsStr}`;
    return this.simpleHash(content);
  }

  /**
   * 生成工具使用ID
   */
  private generateToolUseId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `toolu_${timestamp}_${random}`;
  }

  /**
   * 简单哈希函数
   */
  private simpleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36).substring(0, 8);
  }

  /**
   * 获取缓冲区状态
   */
  getBuffer(): StreamBuffer {
    return this.buffer;
  }

  /**
   * 重置文本追踪
   */
  resetTextTracking(): void {
    this.lastTextContent = '';
  }
}

export class StreamTransformer {
  /**
   * 生成符合Claude格式的消息ID
   */
  private static generateClaudeMessageId(): string {
    const randomString = Math.random().toString(36).substr(2, 15) +
                        Math.random().toString(36).substr(2, 10);
    return `msg_${randomString.substr(0, 25)}`;
  }

  /**
   * 生成工具使用ID
   */
  private static generateToolUseId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `toolu_${timestamp}_${random}`;
  }

  /**
   * 生成函数调用的唯一签名
   */
  private static generateFunctionSignature(functionCall: { name: string; args: any }): string {
    const argsStr = JSON.stringify(functionCall.args || {});
    const content = `${functionCall.name}:${argsStr}`;
    return this.simpleHash(content);
  }

  /**
   * 简单哈希函数
   */
  private static simpleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36).substring(0, 8);
  }

  /**
   * 创建Gemini到Claude的流转换器 - 增强版本
   */
  static createClaudeStreamTransformer(claudeModel: string, exposeThinkingToClient: boolean = false): TransformStream<Uint8Array, Uint8Array> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = '';
    let messageStarted = false;
    let streamFinished = false; // 防止重复结束事件
    let currentContent: ClaudeContentBlock[] = [];
    let currentTextContent = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const messageId = this.generateClaudeMessageId();
    let pingInterval: any = null;
    let currentBlockIndex = 0;

    // 使用增强的状态管理器 - 恢复自Node.js版本
    const stateManager = new StreamStateManager();
    console.log(`[StreamDebug] Created new StreamStateManager for model: ${claudeModel}`);

    // 转换停止原因的辅助函数
    const transformStopReason = (finishReason: string): {
      stop_reason: string;
      stop_sequence?: string;
    } => {
      switch (finishReason?.toUpperCase()) {
        case 'STOP':
          return { stop_reason: 'end_turn' };
        case 'MAX_TOKENS':
          return { stop_reason: 'max_tokens' };
        case 'STOP_SEQUENCE':
          return { stop_reason: 'stop_sequence' };
        case 'TOOL_CALLS':
        case 'FUNCTION_CALL':
          return { stop_reason: 'tool_use' };
        case 'SAFETY':
        case 'RECITATION':
          // 处理安全过滤和内容重复等情况
          console.warn(`[StreamTransformer] Response terminated due to safety/recitation: ${finishReason}`);
          return { stop_reason: 'end_turn' };
        case 'OTHER':
          // Gemini 的 OTHER 状态，可能包含 isNewTopic 等特殊终止原因
          console.info(`[StreamTransformer] Response terminated with OTHER reason (may include isNewTopic): ${finishReason}`);
          return { stop_reason: 'end_turn' };
        default:
          return { stop_reason: 'end_turn' };
      }
    };

    return new TransformStream({
      async start(controller) {
        // 发送初始ping以保持连接活跃
        pingInterval = setInterval(() => {
          const pingEvent: ClaudeStreamEvent = { type: 'ping' };
          controller.enqueue(encoder.encode(`event: ping\ndata: ${JSON.stringify(pingEvent)}\n\n`));
        }, 15000); // 每15秒发送一次ping
      },

      async transform(chunk, controller) {
        try {
          buffer += decoder.decode(chunk, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            // 跳过空行
            if (line.trim() === '') continue;

            // 增强的SSE格式处理
            let data: string | null = null;

            if (line.startsWith('data: ')) {
              data = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              data = line.slice(5).trim();
            } else if (line.startsWith('{') && line.endsWith('}')) {
              // 只有当行以 { 开始并以 } 结束时才尝试解析为 JSON
              data = line.trim();
            } else {
              continue;
            }

            if (!data || data === '[DONE]' || data === '') {
              continue;
            }

            try {
              const geminiChunk = JSON.parse(data) as GeminiStreamResponse;

              // 详细调试：记录Gemini原始返回内容
              if (geminiChunk.candidates?.[0]?.content?.parts) {
                console.log(`[GeminiDebug] Raw Gemini response parts:`, JSON.stringify(geminiChunk.candidates[0].content.parts, null, 2));

                console.log(`[StreamDebug] Gemini parts structure:`, JSON.stringify(geminiChunk.candidates[0].content.parts.map((p: any) => ({
                  hasText: 'text' in p,
                  hasThought: 'thought' in p,
                  textLength: p.text?.length || 0,
                  thoughtLength: p.thought?.content?.length || p.thought?.length || 0,
                  thoughtRedacted: p.thought?.redacted,
                  keys: Object.keys(p)
                })), null, 2));
              }

              // 首次消息，发送message_start
              if (!messageStarted) {
                messageStarted = true;
                totalInputTokens = geminiChunk.usageMetadata?.promptTokenCount || 0;

                const messageStart: ClaudeStreamEvent = {
                  type: 'message_start',
                  message: {
                    id: messageId,
                    type: 'message',
                    role: 'assistant',
                    content: [],
                    model: claudeModel,
                    stop_reason: null,
                    stop_sequence: null,
                    usage: {
                      input_tokens: totalInputTokens,
                      output_tokens: 0
                    }
                  } as ClaudeResponse
                };

                const eventData = `event: message_start\ndata: ${JSON.stringify(messageStart)}\n\n`;
                controller.enqueue(encoder.encode(eventData));

                // 发送content_block_start
                const blockStart: ClaudeStreamEvent = {
                  type: 'content_block_start',
                  index: 0,
                  content_block: {
                    type: 'text',
                    text: ''
                  } as ClaudeTextBlock
                };

                controller.enqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify(blockStart)}\n\n`));
                currentContent.push({ type: 'text', text: '' });
              }

              // 处理文本内容和工具调用
              if (geminiChunk.candidates?.[0]?.content?.parts) {
                for (const part of geminiChunk.candidates[0].content.parts) {
                  if ('text' in part && part.text && !('thought' in part) && (part as any).thought !== true) {
                    // 只处理非思考的普通文本内容
                    console.log(`[StreamDebug] Processing normal text content: ${part.text.length} chars, hasThought: false`);

                    // 检测 isNewTopic 元数据
                    // 这是 Claude CLI 的会话管理信息，应该保留并传递给客户端
                    if (part.text.includes('isNewTopic') && part.text.includes('title')) {
                      try {
                        // 尝试解析，去除可能的 markdown 代码块标记
                        const cleanedText = part.text.replace(/^```json\s*|\s*```$/gm, '').trim();
                        const parsed = JSON.parse(cleanedText);

                        if ('isNewTopic' in parsed && typeof parsed.isNewTopic === 'boolean') {
                          console.log(`[StreamDebug] Detected Claude CLI metadata (isNewTopic: ${parsed.isNewTopic}, title: ${parsed.title})`);
                          console.log(`[StreamDebug] Passing metadata to client as part of response.`);

                          // 继续处理，让这个内容作为响应的一部分发送给客户端
                          // Claude CLI 会解析这个 JSON 来管理会话
                        }
                      } catch (e) {
                        // 不是有效的 JSON，可能只是包含这些词的正常文本
                        console.log(`[StreamDebug] Text contains 'isNewTopic' but is not valid JSON, treating as normal text`);
                      }
                    }

                    // 使用状态管理器进行增量检测 - 恢复自Node.js版本
                    const incrementalText = stateManager.processIncrementalText(part.text);
                    if (!incrementalText) {
                      continue; // 跳过无增量的重复内容
                    }

                    // 发送文本增量
                    const delta: ClaudeStreamEvent = {
                      type: 'content_block_delta',
                      index: 0,
                      delta: {
                        type: 'text_delta',
                        text: incrementalText
                      }
                    };

                    controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify(delta)}\n\n`));
                    currentTextContent += incrementalText;
                  } else if (('thought' in part && 'text' in part) || ((part as any).thought === true && 'text' in part)) {
                    // 正确处理Gemini思考格式
                    // 注意：Gemini 2.5 Flash 在启用thinking后，会将内容标记为 thought: true
                    const isThoughtContent = (part as any).thought === true || ('thought' in part && (part as any).thought);
                    const textContent = 'text' in part ? (part as any).text : '';

                    console.log(`[StreamDebug] Processing content with thought flag: ${isThoughtContent}, text length: ${textContent.length}`);

                    // 检查是否是 Flash 模型
                    const isFlashModel = claudeModel.toLowerCase().includes('flash') ||
                                         claudeModel.toLowerCase().includes('sonnet');

                    // 检查思考内容是否包含特殊的终止标记
                    if (textContent.includes('isNewTopic')) {
                      console.warn('[StreamDebug] Content contains isNewTopic, may indicate conversation termination');
                    }

                    // 如果客户端没有启用thinking，应该完全过滤掉标记为thought的内容
                    if (!exposeThinkingToClient && isThoughtContent) {
                      // 不暴露 thinking 时，完全过滤掉思考内容
                      console.log(`[StreamDebug] Filtering out thinking content (client did not enable thinking): ${textContent.length} chars`);

                      // 重置状态管理器，确保后续正常内容不受影响
                      stateManager.resetTextTracking();

                      // 跳过这个thinking内容，继续处理下一个part
                      continue;
                    } else if (exposeThinkingToClient && isThoughtContent && isFlashModel) {
                      // Flash/Sonnet 模型特殊处理：当启用thinking时，Flash模型只返回thinking内容
                      // 我们需要发送thinking块，同时也需要确保有文本响应
                      console.log(`[StreamDebug] Flash/Sonnet model with thinking enabled - processing thinking content`);

                      // 1. 发送thinking块
                      const thinkingBlockStart: ClaudeStreamEvent = {
                        type: 'content_block_start',
                        index: currentBlockIndex,
                        content_block: {
                          type: 'thinking',
                          thinking: '',
                          signature: ThinkingTransformer.generateThinkingSignature(textContent)
                        } as ClaudeThinkingBlock
                      };
                      controller.enqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify(thinkingBlockStart)}\n\n`));

                      const thinkingDelta: ClaudeStreamEvent = {
                        type: 'content_block_delta',
                        index: currentBlockIndex,
                        delta: {
                          type: 'thinking_delta',
                          thinking: textContent
                        }
                      };
                      controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify(thinkingDelta)}\n\n`));

                      const thinkingBlockStop: ClaudeStreamEvent = {
                        type: 'content_block_stop',
                        index: currentBlockIndex
                      };
                      controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(thinkingBlockStop)}\n\n`));

                      currentBlockIndex++;

                      // 2. Flash模型问题：当启用thinking后，所有内容都是thinking，没有正常响应
                      // 因此我们需要将thinking内容也作为响应发送，以确保对话能继续
                      // 尝试从thinking内容中提取实际响应
                      const cleanedResponse = textContent.replace(/^\*\*.*?\*\*\n*/gm, '').trim();

                      if (cleanedResponse && currentTextContent === '') {
                        // 如果还没有文本内容，创建一个文本块
                        const textBlockStart: ClaudeStreamEvent = {
                          type: 'content_block_start',
                          index: currentBlockIndex,
                          content_block: {
                            type: 'text',
                            text: ''
                          } as ClaudeTextBlock
                        };
                        controller.enqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify(textBlockStart)}\n\n`));

                        // 发送清理后的文本
                        const textDelta: ClaudeStreamEvent = {
                          type: 'content_block_delta',
                          index: currentBlockIndex,
                          delta: {
                            type: 'text_delta',
                            text: cleanedResponse
                          }
                        };
                        controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify(textDelta)}\n\n`));

                        currentTextContent += cleanedResponse;
                        currentBlockIndex++;

                        console.log(`[StreamDebug] Flash model: Created text response from thinking content`);
                      }
                    } else if (exposeThinkingToClient && isThoughtContent && !isFlashModel) {
                      // Pro 模型：使用原有的分离逻辑
                      // 分离思考内容和对话回复（传入模型类型以支持不同的分离策略）
                      const { thinking, response } = ThinkingTransformer.separateThinkingAndResponse(textContent, claudeModel);

                      if (thinking.trim()) {
                        console.log(`[StreamDebug] Creating thinking block: ${thinking.length} chars`);

                        // 发送thinking content block
                        const thinkingBlockStart: ClaudeStreamEvent = {
                          type: 'content_block_start',
                          index: currentBlockIndex,
                          content_block: {
                            type: 'thinking',
                            thinking: '',
                            signature: ThinkingTransformer.generateThinkingSignature(thinking)
                          } as ClaudeThinkingBlock
                        };
                        controller.enqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify(thinkingBlockStart)}\n\n`));

                        const thinkingDelta: ClaudeStreamEvent = {
                          type: 'content_block_delta',
                          index: currentBlockIndex,
                          delta: {
                            type: 'thinking_delta',
                            thinking: thinking
                          }
                        };
                        controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify(thinkingDelta)}\n\n`));

                        const thinkingBlockStop: ClaudeStreamEvent = {
                          type: 'content_block_stop',
                          index: currentBlockIndex
                        };
                        controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(thinkingBlockStop)}\n\n`));

                        currentBlockIndex++;
                      }

                      // 发送对话回复内容（如果有）
                      if (response && response.trim()) {
                        console.log(`[StreamDebug] Creating response text block: ${response.length} chars`);

                        // 不使用状态管理器检测，因为这是从thinking分离出的新内容
                        // 直接发送响应内容，确保对话回复能够显示

                        // 如果没有发送过任何文本内容块，先发送content_block_start
                        if (currentBlockIndex === 0 || (exposeThinkingToClient && currentBlockIndex === 1)) {
                          const responseBlockStart: ClaudeStreamEvent = {
                            type: 'content_block_start',
                            index: currentBlockIndex,
                            content_block: {
                              type: 'text',
                              text: ''
                            } as ClaudeTextBlock
                          };
                          controller.enqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify(responseBlockStart)}\n\n`));
                        }

                        const responseDelta: ClaudeStreamEvent = {
                          type: 'content_block_delta',
                          index: currentBlockIndex,
                          delta: {
                            type: 'text_delta',
                            text: response
                          }
                        };
                        controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify(responseDelta)}\n\n`));

                        const responseBlockStop: ClaudeStreamEvent = {
                          type: 'content_block_stop',
                          index: currentBlockIndex
                        };
                        controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(responseBlockStop)}\n\n`));

                        currentBlockIndex++;
                        currentTextContent += response;
                      }
                    }

                    continue; // 思考内容处理完毕
                  } else if ('functionCall' in part && part.functionCall) {
                    // 详细调试：记录函数调用原始数据
                    console.log(`[FunctionCallDebug] Raw function call detected:`, {
                      functionCall: part.functionCall,
                      partKeys: Object.keys(part),
                      hasArgs: 'args' in part.functionCall,
                      argsType: typeof part.functionCall.args,
                      argsContent: part.functionCall.args
                    });

                    // 使用状态管理器进行函数调用去重
                    const functionCall = part.functionCall;
                    const signature = stateManager.generateFunctionSignature(functionCall);

                    // 检查本地状态管理器
                    let shouldSkip = stateManager.isDuplicateFunctionCall(functionCall);

                    console.log(`[StreamDebug] Processing function call: ${functionCall.name}`, {
                      args: functionCall.args,
                      signature,
                      isDuplicate: shouldSkip,
                      processedCalls: Array.from(stateManager.processedFunctionCalls.keys())
                    });

                    // 仅使用本地状态管理器进行去重

                    if (shouldSkip) {
                      console.log(`[StreamDebug] Skipping duplicate function call: ${functionCall.name} (${signature})`);
                      continue;
                    }

                    // 记录到本地状态管理器
                    const toolUseId = stateManager.recordFunctionCall(functionCall);
                    console.log(`[StreamDebug] Recorded new function call: ${functionCall.name} -> ${toolUseId}`);

                    // 处理args - 可能是字符串或对象
                    let args = part.functionCall.args || {};
                    console.log(`[FunctionCallDebug] Processing args:`, {
                      originalArgs: part.functionCall.args,
                      originalType: typeof part.functionCall.args,
                      isEmpty: !part.functionCall.args
                    });

                    if (typeof args === 'string') {
                      console.log(`[FunctionCallDebug] Args is string, attempting to parse:`, args);
                      try {
                        args = JSON.parse(args);
                        console.log(`[FunctionCallDebug] Successfully parsed args:`, args);
                      } catch (e) {
                        console.error(`[FunctionCallDebug] Failed to parse args as JSON:`, {
                          error: e.message,
                          originalArgs: args
                        });
                        args = {};
                      }
                    } else {
                      console.log(`[FunctionCallDebug] Args is object:`, args);
                    }

                    // TodoWrite 工具不需要特殊处理 - Claude Code 客户端会自行处理显示
                    // 只需要正常传递 tool_use 内容块即可
                    if (functionCall.name === 'TodoWrite') {
                      console.log(`[StreamDebug] TodoWrite tool detected, todos:`, args.todos?.map((t: any) => ({
                        status: t.status,
                        content: t.content,
                        activeForm: t.activeForm
                      })));
                    }

                    // 先结束当前文本块（如果有）
                    if (currentBlockIndex === 0 && currentTextContent) {
                      const blockStop: ClaudeStreamEvent = {
                        type: 'content_block_stop',
                        index: 0
                      };
                      controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(blockStop)}\n\n`));
                      currentBlockIndex++;
                    }

                    // 创建工具使用块
                    const toolUse: ClaudeContentBlock = {
                      type: 'tool_use',
                      id: toolUseId,
                      name: part.functionCall.name,
                      input: args
                    };



                    // 发送工具使用开始事件
                    const toolBlockStart: ClaudeStreamEvent = {
                      type: 'content_block_start',
                      index: currentBlockIndex,
                      content_block: toolUse
                    };
                    controller.enqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify(toolBlockStart)}\n\n`));

                    // 对于 TodoWrite 工具，我们需要确保参数被正确传递
                    // 发送工具参数增量事件 - 这是关键！Claude CLI需要这个来获取参数
                    const inputDelta: ClaudeStreamEvent = {
                      type: 'content_block_delta',
                      index: currentBlockIndex,
                      delta: {
                        type: 'input_json_delta',
                        partial_json: JSON.stringify(args)
                      }
                    };
                    controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify(inputDelta)}\n\n`));

                    // 发送工具使用停止事件
                    const toolBlockStop: ClaudeStreamEvent = {
                      type: 'content_block_stop',
                      index: currentBlockIndex
                    };
                    controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(toolBlockStop)}\n\n`));

                    currentContent.push(toolUse);
                    currentBlockIndex++;
                  } else if ('functionResponse' in part && part.functionResponse) {
                    // 处理函数响应（通常不会在流式中出现，但以防万一）
                    const streamBuffer = stateManager.getBuffer();
                    const matchingCall = streamBuffer.functionCalls.find(
                      call => call.name === part.functionResponse.name
                    );
                    const toolUseId = matchingCall?.id || stateManager['generateToolUseId']();

                    streamBuffer.functionResponses.push({
                      name: part.functionResponse.name,
                      response: part.functionResponse.response,
                      callId: toolUseId
                    });
                  }
                }
              }

              // 检查是否有 isNewTopic 或其他特殊终止
              if (geminiChunk.candidates?.[0]?.finishReason === 'OTHER' ||
                  geminiChunk.candidates?.[0]?.finishReason === 'BLOCKED_PROMPT' ||
                  (geminiChunk.promptFeedback?.blockReason)) {
                console.warn('[StreamTransformer] Special termination detected:', {
                  finishReason: geminiChunk.candidates?.[0]?.finishReason,
                  blockReason: geminiChunk.promptFeedback?.blockReason,
                  raw: JSON.stringify(geminiChunk)
                });
              }

              // 检查是否完成
              if (geminiChunk.candidates?.[0]?.finishReason && !streamFinished) {
                streamFinished = true; // 标记流已完成，防止重复处理

                // 如果没有发送过任何内容
                if (!currentTextContent && currentBlockIndex === 0) {
                  console.warn('[StreamDebug] Stream finished but no content was sent (all content was filtered thinking)');
                }

                // 发送content_block_stop（处理索引计算）
                if (currentTextContent) {
                  // 如果有文本内容，关闭最后一个文本块
                  const textBlockIndex = currentBlockIndex > 0 ? currentBlockIndex : 0;
                  const blockStop: ClaudeStreamEvent = {
                    type: 'content_block_stop',
                    index: textBlockIndex
                  };
                  controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(blockStop)}\n\n`));
                  console.log(`[StreamDebug] Closed text block at index ${textBlockIndex}`);
                } else if (currentBlockIndex > 0) {
                  // 没有文本内容但有其他块（如thinking块），关闭最后一个块
                  const blockStop: ClaudeStreamEvent = {
                    type: 'content_block_stop',
                    index: currentBlockIndex - 1
                  };
                  controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(blockStop)}\n\n`));
                  console.log(`[StreamDebug] Closed last block at index ${currentBlockIndex - 1}`);
                }

                // 更新token统计 - 包含思维令牌和缓存令牌信息
                totalOutputTokens = geminiChunk.usageMetadata?.candidatesTokenCount || currentTextContent.length / 4; // 估算
                const thinkingTokens = geminiChunk.usageMetadata?.thoughtsTokenCount;
                const cachedTokens = geminiChunk.usageMetadata?.cachedContentTokenCount;

                // 记录完整的令牌使用情况（仅在调试模式下）
                if (thinkingTokens || cachedTokens) {
                  console.debug('Stream token details:', {
                    output: totalOutputTokens,
                    thinking: thinkingTokens,
                    cached: cachedTokens,
                    total: geminiChunk.usageMetadata?.totalTokenCount
                  });
                }

                // 发送message_delta
                const stopInfo = transformStopReason(geminiChunk.candidates[0].finishReason);
                const messageDelta: ClaudeStreamEvent = {
                  type: 'message_delta',
                  delta: {
                    stop_reason: stopInfo.stop_reason,
                    stop_sequence: stopInfo.stop_sequence
                  },
                  usage: {
                    output_tokens: totalOutputTokens
                  }
                };
                controller.enqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify(messageDelta)}\n\n`));

                // 发送message_stop
                const stopEvent: ClaudeStreamEvent = {
                  type: 'message_stop'
                };
                controller.enqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify(stopEvent)}\n\n`));
              }
            } catch (e) {
              console.error('[StreamTransformer] Error parsing Gemini response:', e);
              console.error('[StreamTransformer] Raw data that failed to parse:', data);

              // 检查是否是 isNewTopic 相关的特殊响应
              if (data && typeof data === 'string' && data.includes('isNewTopic')) {
                console.warn('[StreamTransformer] Detected isNewTopic in response, conversation may have been terminated');

                // 不要在这里发送结束事件，因为这可能会导致重复的结束事件
                // 相反，让正常的流程处理结束
                // 只需要记录这个情况，继续处理下一个数据块
                continue;
              }

              // 对于其他解析错误，继续处理下一个数据块
              continue;
            }
          }
        } catch (error) {
          const errorEvent: ClaudeStreamEvent = {
            type: 'error',
            error: {
              type: 'stream_error',
              message: error instanceof Error ? error.message : 'Stream processing error'
            }
          };
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify(errorEvent)}\n\n`));
        }
      },

      flush(controller) {
        // 清理ping interval
        if (pingInterval) {
          clearInterval(pingInterval);
        }

        // 处理剩余的缓冲数据 - 修复重复响应
        if (buffer.trim()) {
          try {
            let data: string | null = null;

            if (buffer.startsWith('data: ')) {
              data = buffer.slice(6).trim();
            } else if (buffer.startsWith('data:')) {
              data = buffer.slice(5).trim();
            } else if (buffer.includes('{')) {
              data = buffer.trim();
            }

            if (data && data !== '[DONE]') {
              try {
                const geminiChunk = JSON.parse(data) as GeminiStreamResponse;
                // 处理最后的数据块 - 使用状态管理器确保无重复
                if (geminiChunk.candidates?.[0]?.content?.parts) {
                  for (const part of geminiChunk.candidates[0].content.parts) {
                    if ('text' in part && part.text) {
                      // 使用状态管理器检查重复
                      const incrementalText = stateManager.processIncrementalText(part.text);
                      if (incrementalText) {
                        const delta: ClaudeStreamEvent = {
                          type: 'content_block_delta',
                          index: 0,
                          delta: {
                            type: 'text_delta',
                            text: incrementalText
                          }
                        };
                        controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify(delta)}\n\n`));
                      }
                    } else if ('thought' in part && (part as any).thought) {
                      // 正确处理思考内容 - 根据配置决定是否暴露
                      if (exposeThinkingToClient) {
                        console.log(`[StreamDebug] Creating thinking block in flush: ${(part as any).thought.length} chars`);

                        // 在flush阶段简化处理，直接作为完整thinking block
                        const thinkingBlockStart: ClaudeStreamEvent = {
                          type: 'content_block_start',
                          index: 0,
                          content_block: {
                            type: 'thinking',
                            thinking: (part as any).thought,
                            signature: ThinkingTransformer.generateThinkingSignature((part as any).thought)
                          } as ClaudeThinkingBlock
                        };
                        controller.enqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify(thinkingBlockStart)}\n\n`));

                        const thinkingBlockStop: ClaudeStreamEvent = {
                          type: 'content_block_stop',
                          index: 0
                        };
                        controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(thinkingBlockStop)}\n\n`));
                      } else {
                        console.log(`[StreamDebug] Filtering out thought content in flush: ${(part as any).thought.length} chars`);
                      }
                      continue;
                    }
                  }
                }
              } catch (e) {
                console.error('[StreamTransformer] Error processing final chunk in flush:', e);
                console.error('[StreamTransformer] Failed data:', data);

                // 检查是否是 isNewTopic 相关的响应
                if (data && typeof data === 'string' && data.includes('isNewTopic')) {
                  console.warn('[StreamTransformer] Detected isNewTopic in final flush, conversation was terminated');
                }
              }
            }
          } catch (e) {
            console.warn('[StreamTransformer] Error processing buffer in flush:', e);
            console.warn('[StreamTransformer] Buffer content:', buffer);

            // 检查缓冲区是否包含 isNewTopic
            if (buffer && buffer.includes('isNewTopic')) {
              console.warn('[StreamTransformer] Detected isNewTopic in buffer during flush');
            }
          }
        }

        // 如果消息已开始但未正常结束，发送结束事件（仅在需要时）
        if (messageStarted && !streamFinished) {
          // 发送content_block_stop
          const blockStop: ClaudeStreamEvent = {
            type: 'content_block_stop',
            index: 0
          };
          controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(blockStop)}\n\n`));

          // 发送message_delta
          const messageDelta: ClaudeStreamEvent = {
            type: 'message_delta',
            delta: {
              stop_reason: 'end_turn'
            },
            usage: {
              output_tokens: totalOutputTokens || currentTextContent.length / 4
            }
          };
          controller.enqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify(messageDelta)}\n\n`));

          // 发送message_stop
          const stopEvent: ClaudeStreamEvent = {
            type: 'message_stop'
          };
          controller.enqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify(stopEvent)}\n\n`));
        }
      }
    });
  }

  /**
   * 创建Gemini流到Claude流的转换管道
   */
  static createStreamPipeline(
    geminiStream: ReadableStream,
    claudeModel: string,
    exposeThinkingToClient: boolean = false
  ): ReadableStream {
    // 直接返回转换后的流
    return geminiStream.pipeThrough(this.createClaudeStreamTransformer(claudeModel, exposeThinkingToClient));
  }

  /**
   * 创建调试流（用于诊断）
   */
  static createDebugStream(geminiStream: ReadableStream): ReadableStream {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    return geminiStream.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        const text = decoder.decode(chunk, { stream: true });
        controller.enqueue(chunk);
      }
    }));
  }
}