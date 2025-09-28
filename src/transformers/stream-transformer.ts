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
 * 流状态管理器 - 优化版本
 */
class StreamStateManager {
  public processedFunctionCalls: Map<string, string> = new Map();
  private lastTextContent: string = '';
  private buffer: StreamBuffer = {
    textContent: '',
    functionCalls: [],
    functionResponses: [],
    thinkingContent: ''
  };

  /**
   * 处理增量文本
   */
  processIncrementalText(text: string): string | null {
    if (!text) return null;

    if (this.lastTextContent && text.startsWith(this.lastTextContent)) {
      const incrementalText = text.substring(this.lastTextContent.length);
      if (!incrementalText) return null;

      this.lastTextContent = text;
      this.buffer.textContent += incrementalText;
      return incrementalText;
    }

    if (this.lastTextContent === text) return null;

    this.lastTextContent = text;
    this.buffer.textContent += text;
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
   * 生成符合Claude格式的消息ID
   */
  private static generateClaudeMessageId(): string {
    const randomString = Math.random().toString(36).substr(2, 15) +
                        Math.random().toString(36).substr(2, 10);
    return `msg_${randomString.substr(0, 25)}`;
  }

  /**
   * 创建Gemini到Claude的流转换器 - 优化版本
   */
  static createClaudeStreamTransformer(claudeModel: string, exposeThinkingToClient: boolean = false): TransformStream<Uint8Array, Uint8Array> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = '';
    let messageStarted = false;
    let streamFinished = false;
    let currentTextContent = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const messageId = this.generateClaudeMessageId();
    let currentBlockIndex = 0;

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

                controller.enqueue(encoder.encode(`event: message_start\\ndata: ${JSON.stringify(messageStart)}\\n\\n`));

                // 发送content_block_start
                const blockStart: ClaudeStreamEvent = {
                  type: 'content_block_start',
                  index: 0,
                  content_block: { type: 'text', text: '' } as ClaudeTextBlock
                };

                controller.enqueue(encoder.encode(`event: content_block_start\\ndata: ${JSON.stringify(blockStart)}\\n\\n`));
              }

              // 处理文本内容和工具调用
              if (geminiChunk.candidates?.[0]?.content?.parts) {
                for (const part of geminiChunk.candidates[0].content.parts) {
                  // 处理文本内容
                  if ('text' in part && part.text && !('thought' in part)) {
                    const incrementalText = stateManager.processIncrementalText(part.text);
                    if (incrementalText) {
                      const delta: ClaudeStreamEvent = {
                        type: 'content_block_delta',
                        index: 0,
                        delta: { type: 'text_delta', text: incrementalText }
                      };
                      controller.enqueue(encoder.encode(`event: content_block_delta\\ndata: ${JSON.stringify(delta)}\\n\\n`));
                      currentTextContent += incrementalText;
                    }
                  }
                  // 处理thinking内容
                  else if (('thought' in part && 'text' in part) && exposeThinkingToClient) {
                    const thinkingText = (part as any).text;
                    const thinkingBlockStart: ClaudeStreamEvent = {
                      type: 'content_block_start',
                      index: currentBlockIndex,
                      content_block: {
                        type: 'thinking',
                        thinking: '',
                        signature: ThinkingTransformer.generateThinkingSignature(thinkingText)
                      } as ClaudeThinkingBlock
                    };
                    controller.enqueue(encoder.encode(`event: content_block_start\\ndata: ${JSON.stringify(thinkingBlockStart)}\\n\\n`));

                    const thinkingDelta: ClaudeStreamEvent = {
                      type: 'content_block_delta',
                      index: currentBlockIndex,
                      delta: { type: 'thinking_delta', thinking: thinkingText }
                    };
                    controller.enqueue(encoder.encode(`event: content_block_delta\\ndata: ${JSON.stringify(thinkingDelta)}\\n\\n`));

                    const thinkingBlockStop: ClaudeStreamEvent = {
                      type: 'content_block_stop',
                      index: currentBlockIndex
                    };
                    controller.enqueue(encoder.encode(`event: content_block_stop\\ndata: ${JSON.stringify(thinkingBlockStop)}\\n\\n`));
                    currentBlockIndex++;
                  }
                  // 处理工具调用
                  else if ('functionCall' in part && part.functionCall) {
                    if (stateManager.isDuplicateFunctionCall(part.functionCall)) continue;

                    const toolUseId = stateManager.recordFunctionCall(part.functionCall);
                    let args = part.functionCall.args || {};

                    if (typeof args === 'string') {
                      try { args = JSON.parse(args); }
                      catch { args = {}; }
                    }

                    // 结束当前文本块
                    if (currentBlockIndex === 0) {
                      controller.enqueue(encoder.encode(`event: content_block_stop\\ndata: ${JSON.stringify({type: 'content_block_stop', index: 0})}\\n\\n`));
                      currentBlockIndex++;
                    }

                    // 发送工具使用事件
                    const toolUse = {
                      type: 'tool_use',
                      id: toolUseId,
                      name: part.functionCall.name,
                      input: args
                    };

                    controller.enqueue(encoder.encode(`event: content_block_start\\ndata: ${JSON.stringify({type: 'content_block_start', index: currentBlockIndex, content_block: toolUse})}\\n\\n`));
                    controller.enqueue(encoder.encode(`event: content_block_delta\\ndata: ${JSON.stringify({type: 'content_block_delta', index: currentBlockIndex, delta: {type: 'input_json_delta', partial_json: JSON.stringify(args)}})}\\n\\n`));
                    controller.enqueue(encoder.encode(`event: content_block_stop\\ndata: ${JSON.stringify({type: 'content_block_stop', index: currentBlockIndex})}\\n\\n`));
                    currentBlockIndex++;
                  }
                }
              }

              // 检查是否完成
              if (geminiChunk.candidates?.[0]?.finishReason && !streamFinished) {
                streamFinished = true;

                // 发送结束事件
                if (currentTextContent || currentBlockIndex === 0) {
                  const blockIndex = currentBlockIndex > 0 ? currentBlockIndex - 1 : 0;
                  controller.enqueue(encoder.encode(`event: content_block_stop\\ndata: ${JSON.stringify({type: 'content_block_stop', index: blockIndex})}\\n\\n`));
                }

                totalOutputTokens = geminiChunk.usageMetadata?.candidatesTokenCount || Math.floor(currentTextContent.length / 4);
                const stopInfo = transformStopReason(geminiChunk.candidates[0].finishReason);

                controller.enqueue(encoder.encode(`event: message_delta\\ndata: ${JSON.stringify({type: 'message_delta', delta: stopInfo, usage: {output_tokens: totalOutputTokens}})}\\n\\n`));
                controller.enqueue(encoder.encode(`event: message_stop\\ndata: ${JSON.stringify({type: 'message_stop'})}\\n\\n`));
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
          controller.enqueue(encoder.encode(`event: error\\ndata: ${JSON.stringify(errorEvent)}\\n\\n`));
        }
      },

      flush(controller) {
        // 简化flush处理
        if (messageStarted && !streamFinished) {
          controller.enqueue(encoder.encode(`event: content_block_stop\\ndata: ${JSON.stringify({type: 'content_block_stop', index: 0})}\\n\\n`));
          controller.enqueue(encoder.encode(`event: message_delta\\ndata: ${JSON.stringify({type: 'message_delta', delta: {stop_reason: 'end_turn'}, usage: {output_tokens: Math.floor(currentTextContent.length / 4)}})}\\n\\n`));
          controller.enqueue(encoder.encode(`event: message_stop\\ndata: ${JSON.stringify({type: 'message_stop'})}\\n\\n`));
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
        controller.enqueue(chunk);
      }
    }));
  }
}