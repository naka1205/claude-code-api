/**
 * 流式响应转换器
 * 基于官方文档实现Claude和Gemini流式响应的正确转换
 * 官方文档：
 * - Claude: https://docs.claude.com/zh-CN/docs/build-with-claude/streaming
 * - Gemini: https://ai.google.dev/gemini-api/docs/function-calling
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
import { Logger } from '../utils/logger';

interface StreamBuffer {
  textContent: string;
  functionCalls: Array<{ name: string; args: any; id: string }>;
  functionResponses: Array<{ name: string; response: any; callId: string }>;
  thinkingContent?: string;
  contentBlocks: ClaudeContentBlock[];
  currentBlockIndex: number;
}

/**
 * 流状态管理器
 * 正确处理Claude流式事件序列和内容块状态
 */
class StreamStateManager {
  public processedFunctionCalls: Map<string, string> = new Map();
  private lastTextContent: string = '';
  private buffer: StreamBuffer = {
    textContent: '',
    functionCalls: [],
    functionResponses: [],
    thinkingContent: '',
    contentBlocks: [],
    currentBlockIndex: 0
  };
  private currentTextBlockIndex: number = 0;
  private hasStartedTextBlock: boolean = false;
  private hasStartedThinkingBlock: boolean = false;

  /**
   * 开始新的内容块
   */
  startContentBlock(blockType: 'text' | 'thinking' | 'tool_use', blockData?: any): number {
    const blockIndex = this.buffer.currentBlockIndex;

    let contentBlock: ClaudeContentBlock;
    switch (blockType) {
      case 'text':
        contentBlock = { type: 'text', text: '' } as ClaudeTextBlock;
        this.hasStartedTextBlock = true;
        this.currentTextBlockIndex = blockIndex;
        break;
      case 'thinking':
        contentBlock = {
          type: 'thinking',
          thinking: '',
          signature: blockData?.signature
        } as ClaudeThinkingBlock;
        this.hasStartedThinkingBlock = true;
        break;
      case 'tool_use':
        contentBlock = {
          type: 'tool_use',
          id: blockData?.id,
          name: blockData?.name,
          input: blockData?.input || {}
        };
        break;
      default:
        throw new Error(`Unsupported block type: ${blockType}`);
    }

    this.buffer.contentBlocks[blockIndex] = contentBlock;
    this.buffer.currentBlockIndex++;
    return blockIndex;
  }

  /**
   * 更新内容块
   */
  updateContentBlock(blockIndex: number, deltaType: string, deltaData: any): void {
    const block = this.buffer.contentBlocks[blockIndex];
    if (!block) return;

    switch (deltaType) {
      case 'text_delta':
        if (block.type === 'text') {
          (block as ClaudeTextBlock).text += deltaData.text || '';
        }
        break;
      case 'thinking_delta':
        if (block.type === 'thinking') {
          (block as ClaudeThinkingBlock).thinking += deltaData.thinking || '';
        }
        break;
      case 'input_json_delta':
        if (block.type === 'tool_use') {
          // 工具输入通常不需要增量更新，但可以支持
        }
        break;
    }
  }

  /**
   * 获取当前文本块索引
   */
  getCurrentTextBlockIndex(): number {
    return this.currentTextBlockIndex;
  }

  /**
   * 是否已开始文本块
   */
  hasTextBlockStarted(): boolean {
    return this.hasStartedTextBlock;
  }

  /**
   * 是否已开始思考块
   */
  hasThinkingBlockStarted(): boolean {
    return this.hasStartedThinkingBlock;
  }
  /**
   * 处理增量文本 - 修复Gemini增量式响应的去重问题
   */
  processIncrementalText(text: string): string | null {
    if (!text) return null;

    // 检查是否为完全重复的内容
    if (this.lastTextContent === text) return null;

    // 检查是否为累积式内容 (Gemini某些情况下的响应模式)
    if (this.lastTextContent && text.startsWith(this.lastTextContent)) {
      const incrementalText = text.substring(this.lastTextContent.length);
      if (!incrementalText) return null;

      this.lastTextContent = text;
      this.buffer.textContent += incrementalText;

      // 更新对应的内容块
      if (this.hasStartedTextBlock) {
        this.updateContentBlock(this.currentTextBlockIndex, 'text_delta', { text: incrementalText });
      }

      return incrementalText;
    }

    // 检查是否为已包含的子内容 (防止重复发送已有内容)
    if (this.buffer.textContent && this.buffer.textContent.includes(text.trim())) {
      return null;
    }

    // 全新的增量内容 (Gemini标准的增量式响应)
    this.lastTextContent = text;
    this.buffer.textContent += text;

    if (this.hasStartedTextBlock) {
      // 追加到文本块
      const textBlock = this.buffer.contentBlocks[this.currentTextBlockIndex] as ClaudeTextBlock;
      if (textBlock) {
        textBlock.text += text;
      }
    }

    return text;
  }

  /**
   * 检查函数调用去重
   */
  isDuplicateFunctionCall(functionCall: { name: string; args: any }): boolean {
    const signature = this.generateFunctionSignature(functionCall);
    return this.processedFunctionCalls.has(signature);
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

  getBuffer(): StreamBuffer {
    return this.buffer;
  }

  resetTextTracking(): void {
    this.lastTextContent = '';
  }
}

export class StreamTransformer {
  /**
   * 生成内容哈希用于去重
   */
  private static generateContentHash(content: string): string {
    let hash = 0;
    const normalized = content.trim().toLowerCase();
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36).substring(0, 8);
  }

  /**
   * 生成符合Claude格式的消息ID
   */
  private static generateClaudeMessageId(): string {
    const randomString = Math.random().toString(36).substr(2, 15) +
                        Math.random().toString(36).substr(2, 10);
    return `msg_${randomString.substr(0, 25)}`;
  }

  /**
   * 检测并提取文本中的functionCall JSON
   * 这是Gemini的一个bug:有时会将function call以JSON代码块形式输出到文本中
   * @returns 提取的functionCall对象,如果没有则返回null
   */
  private static extractFunctionCallFromText(text: string): { name: string; args: any } | null {
    try {
      // 尝试提取JSON代码块格式: ```json ... ```
      const jsonBlockMatch = text.match(/```json\s*\n?\s*(\{[\s\S]*?"functionCall"[\s\S]*?\})\s*\n?\s*```/i);
      if (jsonBlockMatch) {
        const jsonObj = JSON.parse(jsonBlockMatch[1]);
        if (jsonObj.functionCall) {
          return {
            name: jsonObj.functionCall.name,
            args: jsonObj.functionCall.args || {}
          };
        }
      }

      // 尝试提取直接JSON对象格式
      const directJsonMatch = text.match(/^\s*(\{\s*"functionCall"\s*:\s*\{[\s\S]*?\}\s*\})\s*$/);
      if (directJsonMatch) {
        const jsonObj = JSON.parse(directJsonMatch[1]);
        if (jsonObj.functionCall) {
          return {
            name: jsonObj.functionCall.name,
            args: jsonObj.functionCall.args || {}
          };
        }
      }
    } catch (e) {
      // JSON解析失败,返回null
    }

    return null;
  }

  /**
   * 创建Gemini到Claude的流转换器 - 优化版本
   */
  static createClaudeStreamTransformer(
    claudeModel: string,
    exposeThinkingToClient: boolean = false,
    requestId?: string
  ): TransformStream<Uint8Array, Uint8Array> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = '';
    let messageStarted = false;
    let streamFinished = false;
    let currentTextContent = '';
    let textBlockStarted = false;  // 跟踪文本块是否已开始
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const messageId = this.generateClaudeMessageId();
    let currentBlockIndex = 0;
    let thinkingBlockStarted = false;
    let thinkingBlockIndex = -1;
    let accumulatedThinking = '';
    let thinkingSignature = '';

    const stateManager = new StreamStateManager();

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
        case 'OTHER':
          return { stop_reason: 'end_turn' };
        default:
          return { stop_reason: 'end_turn' };
      }
    };

    return new TransformStream({
      async start(controller) {
        // 移除ping机制以减少开销
      },

      async transform(chunk, controller) {
        try {
          // 辅助函数:发送SSE事件并记录日志
          const sendEvent = (eventType: string, data: any) => {
            const encoded = encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
            controller.enqueue(encoded);
            if (requestId) {
              Logger.logClaudeEvent(requestId, eventType, data);
            }
          };

          buffer += decoder.decode(chunk, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim() === '') continue;

            // 快速检查SSE格式
            let data: string | null = null;
            if (line.startsWith('data: ')) {
              data = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              data = line.slice(5).trim();
            } else if (line.startsWith('{')) {
              data = line.trim();
            } else {
              continue;
            }

            if (!data || data === '[DONE]') continue;

            try {
              const geminiChunk = JSON.parse(data) as GeminiStreamResponse;

              // 记录流数据块
              if (requestId) {
                Logger.logStreamChunk(requestId, geminiChunk);
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

                sendEvent('message_start', messageStart);
              }

              // 处理文本内容和工具调用
              if (geminiChunk.candidates?.[0]?.content?.parts) {
                for (const part of geminiChunk.candidates[0].content.parts) {
                  if (streamFinished) break;

                  // 处理文本内容 - 排除带thought标记和functionCall的part
                  if ('text' in part && part.text && !('thought' in part) && !('functionCall' in part)) {
                    // 检查文本中是否包含错误输出的functionCall JSON
                    const extractedCall = StreamTransformer.extractFunctionCallFromText(part.text);
                    if (extractedCall) {
                      // 关闭当前文本块(仅当已开始时)
                      if (textBlockStarted) {
                        const blockStop: ClaudeStreamEvent = {
                          type: 'content_block_stop',
                          index: 0
                        };
                        sendEvent('content_block_stop', blockStop);
                        textBlockStarted = false;
                        currentBlockIndex++;
                      }

                      // 发送tool_use block
                      const toolUseId = `toolu_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                      const toolUseStart: ClaudeStreamEvent = {
                        type: 'content_block_start',
                        index: currentBlockIndex,
                        content_block: {
                          type: 'tool_use',
                          id: toolUseId,
                          name: extractedCall.name,
                          input: {}
                        } as any
                      };
                      sendEvent('content_block_start', toolUseStart);

                      // 发送input delta
                      const inputDelta: ClaudeStreamEvent = {
                        type: 'content_block_delta',
                        index: currentBlockIndex,
                        delta: {
                          type: 'input_json_delta',
                          partial_json: JSON.stringify(extractedCall.args)
                        }
                      };
                      sendEvent('content_block_delta', inputDelta);

                      // 关闭tool_use block
                      const toolUseStop: ClaudeStreamEvent = {
                        type: 'content_block_stop',
                        index: currentBlockIndex
                      };
                      sendEvent('content_block_stop', toolUseStop);

                      currentBlockIndex++;
                      continue;
                    }

                    const incrementalText = stateManager.processIncrementalText(part.text);
                    if (incrementalText) {
                      // 确保文本块已开始
                      if (!textBlockStarted) {
                        textBlockStarted = true;
                        const blockStart: ClaudeStreamEvent = {
                          type: 'content_block_start',
                          index: 0,
                          content_block: { type: 'text', text: '' } as ClaudeTextBlock
                        };
                        sendEvent('content_block_start', blockStart);
                      }

                      const delta: ClaudeStreamEvent = {
                        type: 'content_block_delta',
                        index: 0,
                        delta: { type: 'text_delta', text: incrementalText }
                      };
                      sendEvent('content_block_delta', delta);
                      currentTextContent += incrementalText;
                    }
                  }
                  // 处理thinking内容
                  // 核心规则: thoughtSignature出现 = thinking结束
                  // - 有thoughtSignature的part不再是thinking内容,而是对话内容或functionCall
                  // - 只有 thought=true 且无thoughtSignature的part才是thinking内容
                  else if ('thought' in part && 'text' in part && (part as any).thought === true) {
                    const hasSignature = 'thoughtSignature' in part;

                    if (hasSignature) {
                      // 包含thoughtSignature = thinking结束,text是对话内容
                      if (thinkingBlockStarted && exposeThinkingToClient) {
                        const geminiSignature = (part as any).thoughtSignature;
                        thinkingSignature = ThinkingTransformer.convertGeminiSignatureToClaudeFormat(geminiSignature);

                        // 结束thinking block
                        const thinkingBlockStop: ClaudeStreamEvent = {
                          type: 'content_block_stop',
                          index: thinkingBlockIndex
                        };
                        sendEvent('content_block_stop', thinkingBlockStop);
                        thinkingBlockStarted = false;
                      }

                      // text作为对话内容处理(继续执行后面的文本处理逻辑)
                      const dialogText = (part as any).text;
                      const incrementalText = stateManager.processIncrementalText(dialogText);

                      if (incrementalText) {
                        if (!textBlockStarted) {
                          textBlockStarted = true;
                          const blockStart: ClaudeStreamEvent = {
                            type: 'content_block_start',
                            index: 0,
                            content_block: { type: 'text', text: '' }
                          };
                          sendEvent('content_block_start', blockStart);
                        }

                        const delta: ClaudeStreamEvent = {
                          type: 'content_block_delta',
                          index: 0,
                          delta: { type: 'text_delta', text: incrementalText }
                        };
                        sendEvent('content_block_delta', delta);
                        currentTextContent += incrementalText;
                      }
                    } else {
                      // 无thoughtSignature = 真正的thinking内容
                      if (exposeThinkingToClient) {
                        const thinkingText = (part as any).text;

                        if (!thinkingBlockStarted) {
                          // 首次thinking:创建block(不设置signature,等待thoughtSignature)
                          thinkingBlockIndex = currentBlockIndex;
                          thinkingBlockStarted = true;
                          accumulatedThinking = thinkingText;

                          const thinkingBlockStart: ClaudeStreamEvent = {
                            type: 'content_block_start',
                            index: thinkingBlockIndex,
                            content_block: {
                              type: 'thinking',
                              thinking: '',
                              signature: 'sig_pending' // 临时signature
                            } as ClaudeThinkingBlock
                          };
                          sendEvent('content_block_start', thinkingBlockStart);
                          currentBlockIndex++;

                          // 发送thinking内容
                          const thinkingDelta: ClaudeStreamEvent = {
                            type: 'content_block_delta',
                            index: thinkingBlockIndex,
                            delta: { type: 'thinking_delta', thinking: thinkingText }
                          };
                          sendEvent('content_block_delta', thinkingDelta);
                        } else {
                          // 后续thinking:Gemini可能累积发送,提取增量
                          if (thinkingText.startsWith(accumulatedThinking)) {
                            const incrementalThinking = thinkingText.substring(accumulatedThinking.length);
                            if (incrementalThinking) {
                              accumulatedThinking = thinkingText;
                              const thinkingDelta: ClaudeStreamEvent = {
                                type: 'content_block_delta',
                                index: thinkingBlockIndex,
                                delta: { type: 'thinking_delta', thinking: incrementalThinking }
                              };
                              sendEvent('content_block_delta', thinkingDelta);
                            }
                          } else if (!accumulatedThinking.includes(thinkingText.trim())) {
                            // 全新的thinking段落
                            accumulatedThinking += '\n' + thinkingText;
                            const thinkingDelta: ClaudeStreamEvent = {
                              type: 'content_block_delta',
                              index: thinkingBlockIndex,
                              delta: { type: 'thinking_delta', thinking: '\n' + thinkingText }
                            };
                            sendEvent('content_block_delta', thinkingDelta);
                          }
                        }
                      }
                    }
                  }
                  // 处理工具调用 - 保持原有逻辑
                  else if ('functionCall' in part && part.functionCall) {
                    // 检查是否包含thoughtSignature,如果有则表示thinking结束
                    if ('thoughtSignature' in part && thinkingBlockStarted && exposeThinkingToClient) {
                      const geminiSignature = (part as any).thoughtSignature;
                      // 更新thinking block的signature
                      thinkingSignature = ThinkingTransformer.convertGeminiSignatureToClaudeFormat(geminiSignature);
                      // 结束thinking block
                      const thinkingBlockStop: ClaudeStreamEvent = {
                        type: 'content_block_stop',
                        index: thinkingBlockIndex
                      };
                      sendEvent('content_block_stop', thinkingBlockStop);
                      thinkingBlockStarted = false; // 标记thinking已结束
                    }

                    if (stateManager.isDuplicateFunctionCall(part.functionCall)) continue;

                    const toolUseId = stateManager.recordFunctionCall(part.functionCall);
                    let args = part.functionCall.args || {};

                    if (typeof args === 'string') {
                      try { args = JSON.parse(args); }
                      catch { args = {}; }
                    }

                    // 结束当前文本块（仅当文本块已开始时）
                    if (textBlockStarted) {
                      sendEvent('content_block_stop', {type: 'content_block_stop', index: 0});
                      textBlockStarted = false;
                      currentBlockIndex++;
                    }

                    // 发送工具使用事件
                    const toolUse = {
                      type: 'tool_use',
                      id: toolUseId,
                      name: part.functionCall.name,
                      input: args
                    };

                    sendEvent('content_block_start', {type: 'content_block_start', index: currentBlockIndex, content_block: toolUse});
                    sendEvent('content_block_delta', {type: 'content_block_delta', index: currentBlockIndex, delta: {type: 'input_json_delta', partial_json: JSON.stringify(args)}});
                    sendEvent('content_block_stop', {type: 'content_block_stop', index: currentBlockIndex});
                    currentBlockIndex++;
                  }
                }
              }

              // 检查是否完成 - 关键修复: finishReason标记响应轮次结束
              if (geminiChunk.candidates?.[0]?.finishReason && !streamFinished) {
                streamFinished = true;
                const candidate = geminiChunk.candidates[0];

                // 根据finishMessage判断响应类型
                const isToolCall = candidate.finishMessage === "Model generated function call(s).";

                // 结束thinking block（如果仍在进行中且未被thoughtSignature结束）
                if (thinkingBlockStarted && exposeThinkingToClient) {
                  const thinkingBlockStop: ClaudeStreamEvent = {
                    type: 'content_block_stop',
                    index: thinkingBlockIndex
                  };
                  sendEvent('content_block_stop', thinkingBlockStop);
                }

                // 关键修复: 只在文本块已开始时才结束文本块
                if (textBlockStarted) {
                  const textBlockIndex = 0; // 文本总是使用index 0
                  sendEvent('content_block_stop', {type: 'content_block_stop', index: textBlockIndex});
                  textBlockStarted = false;
                }

                totalOutputTokens = geminiChunk.usageMetadata?.candidatesTokenCount || Math.floor(currentTextContent.length / 4);

                // 根据finishReason和finishMessage组合判断stop_reason
                let stopInfo;
                if (isToolCall) {
                  stopInfo = { stop_reason: 'tool_use' };
                } else {
                  stopInfo = transformStopReason(candidate.finishReason || 'STOP');
                }

                sendEvent('message_delta', {type: 'message_delta', delta: stopInfo, usage: {output_tokens: totalOutputTokens}});
                sendEvent('message_stop', {type: 'message_stop'});

                // 正确关闭流
                controller.terminate();
                // 终止处理当前chunk中的后续行
                break;
              }
            } catch (e) {
              // 简化错误处理
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
        // 确保所有block都被正确结束
        if (messageStarted && !streamFinished) {
          // 结束thinking block（如果存在）
          if (thinkingBlockStarted) {
            controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify({type: 'content_block_stop', index: thinkingBlockIndex})}\n\n`));
          }

          // 结束文本block
          controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify({type: 'content_block_stop', index: 0})}\n\n`));
          controller.enqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify({type: 'message_delta', delta: {stop_reason: 'end_turn'}, usage: {output_tokens: Math.floor(currentTextContent.length / 4)}})}\n\n`));
          controller.enqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify({type: 'message_stop'})}\n\n`));
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
    exposeThinkingToClient: boolean = false,
    requestId?: string
  ): ReadableStream {
    return geminiStream.pipeThrough(this.createClaudeStreamTransformer(claudeModel, exposeThinkingToClient, requestId));
  }

  /**
   * 创建调试流（用于诊断）
   */
  static createDebugStream(geminiStream: ReadableStream): ReadableStream {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    return geminiStream.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk);
      }
    }));
  }
}
