/**
 * 流式响应转换器 - Cloudflare Workers版本
 * 处理SSE流式响应的转换
 */

import {
  ClaudeStreamEvent,
  ClaudeResponse,
  ClaudeContentBlock,
  ClaudeTextBlock
} from '../types/claude';
import { GeminiStreamResponse } from '../types/gemini';

export class StreamTransformer {
  /**
   * 创建Gemini到Claude的流转换器
   */
  static createClaudeStreamTransformer(claudeModel: string): TransformStream<Uint8Array, Uint8Array> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = '';
    let messageStarted = false;
    let currentContent: ClaudeContentBlock[] = [];
    let currentTextContent = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return new TransformStream({
      async transform(chunk, controller) {
        try {
          buffer += decoder.decode(chunk, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            // Gemini的SSE格式：data: {json}
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();

              // 检查是否为结束标记
              if (data === '[DONE]' || data === '') {
                continue;
              }

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

                // 处理文本内容
                if (geminiChunk.candidates?.[0]?.content?.parts) {
                  for (const part of geminiChunk.candidates[0].content.parts) {
                    if ('text' in part && part.text) {
                      // 发送文本增量
                      const delta: ClaudeStreamEvent = {
                        type: 'content_block_delta',
                        index: 0,
                        delta: {
                          type: 'text_delta',
                          text: part.text
                        }
                      };

                      controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify(delta)}\n\n`));
                      currentTextContent += part.text;
                    }
                  }
                }

                // 检查是否完成
                if (geminiChunk.candidates?.[0]?.finishReason) {
                  // 发送content_block_stop
                  const blockStop: ClaudeStreamEvent = {
                    type: 'content_block_stop',
                    index: 0
                  };
                  controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(blockStop)}\n\n`));

                  // 更新token统计
                  totalOutputTokens = geminiChunk.usageMetadata?.candidatesTokenCount || currentTextContent.length / 4; // 估算

                  // 发送message_delta
                  const stopInfo = transformStopReason(geminiChunk.candidates[0].finishReason);
                  const messageDelta: ClaudeStreamEvent = {
                    type: 'message_delta',
                    delta: {
                      stop_reason: stopInfo.stop_reason,
                      stop_sequence: stopInfo.stop_sequence || undefined
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
                console.error('Failed to parse Gemini chunk:', e, 'Data:', data);
              }
            }
          }
        } catch (error) {
          console.error('Stream transformation error:', error);
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
        // 处理剩余的缓冲数据
        if (buffer.trim()) {
          try {
            if (buffer.startsWith('data: ')) {
              const data = buffer.slice(6).trim();
              if (data && data !== '[DONE]') {
                const geminiChunk = JSON.parse(data) as GeminiStreamResponse;
                // 处理最后的数据块...
              }
            }
          } catch (e) {
            // 忽略最后的不完整数据
          }
        }

        // 如果消息已开始但未正常结束，发送结束事件
        if (messageStarted) {
          const stopEvent: ClaudeStreamEvent = {
            type: 'message_stop'
          };
          controller.enqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify(stopEvent)}\n\n`));
        }
      }
    });

    // 转换停止原因的辅助函数
    function transformStopReason(finishReason: string): {
      stop_reason: string;
      stop_sequence: string | null;
    } {
      switch (finishReason?.toUpperCase()) {
        case 'STOP':
          return { stop_reason: 'end_turn', stop_sequence: null };
        case 'MAX_TOKENS':
          return { stop_reason: 'max_tokens', stop_sequence: null };
        case 'STOP_SEQUENCE':
          return { stop_reason: 'stop_sequence', stop_sequence: null };
        case 'TOOL_CALLS':
        case 'FUNCTION_CALL':
          return { stop_reason: 'tool_use', stop_sequence: null };
        default:
          return { stop_reason: 'end_turn', stop_sequence: null };
      }
    }
  }

  /**
   * 创建Gemini流到Claude流的转换管道
   */
  static createStreamPipeline(
    geminiStream: ReadableStream,
    claudeModel: string
  ): ReadableStream {
    // 直接返回转换后的流
    return geminiStream.pipeThrough(this.createClaudeStreamTransformer(claudeModel));
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
        console.log('[Debug Stream]:', text);
        controller.enqueue(chunk);
      }
    }));
  }
}