/**
 * 流管理器 - Cloudflare Workers版本
 * 处理SSE流式响应
 */

import { StreamTransformer } from '../transformers/stream-transformer';
import { DataSaver } from '../utils/data-saver';
 

export class StreamManager {
  /**
   * 处理流式响应
   */
  handleStreamResponse(
    stream: ReadableStream,
    claudeModel: string,
    headers: Record<string, string>,
    exposeThinkingToClient: boolean = false,
    requestId?: string
  ): Response {
    try {
      

      // 创建转换后的流，移除KV和会话ID参数
      const transformedStream = StreamTransformer.createStreamPipeline(stream, claudeModel, exposeThinkingToClient);

      // 如果有requestId，添加数据保存的流处理
      const finalStream = requestId ? this.addDataSavingToStream(transformedStream, requestId, claudeModel) : transformedStream;

      // 添加一个额外的转换器来确保正确的SSE格式
      const sseStream = this.ensureSSEFormat(finalStream);

      // 返回SSE响应
      return new Response(sseStream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version',
          'Access-Control-Allow-Credentials': 'true',
          'X-Accel-Buffering': 'no', // 禁用Nginx缓冲
          'X-Content-Type-Options': 'nosniff',
          'Transfer-Encoding': 'chunked'
        }
      });

    } catch (error) {

      // 创建错误流
      const errorStream = this.createErrorStream(error);
      return new Response(errorStream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }

  /**
   * 确保SSE格式正确
   */
  private ensureSSEFormat(stream: ReadableStream): ReadableStream {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = '';

    return stream.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        // 直接传递，因为StreamTransformer已经处理了格式
        controller.enqueue(chunk);
      },

      flush(controller) {
        // 确保流正确结束
        const endMarker = encoder.encode('\n\n');
        controller.enqueue(endMarker);
      }
    }));
  }

  /**
   * 创建错误流
   */
  private createErrorStream(error: any): ReadableStream {
    const encoder = new TextEncoder();
    const errorMessage = error instanceof Error ? error.message : 'Stream processing error';

    return new ReadableStream({
      start(controller) {
        // 发送错误事件
        const errorEvent = {
          type: 'error',
          error: {
            type: 'stream_error',
            message: errorMessage
          }
        };

        controller.enqueue(
          encoder.encode(`event: error\ndata: ${JSON.stringify(errorEvent)}\n\n`)
        );
        controller.close();
      }
    });
  }

  /**
   * 创建测试流（用于调试）
   */
  createTestStream(): ReadableStream {
    const encoder = new TextEncoder();
    let counter = 0;

    return new ReadableStream({
      start(controller) {
        // 发送message_start
        const messageStart = {
          type: 'message_start',
          message: {
            id: 'test_msg',
            type: 'message',
            role: 'assistant',
            content: [],
            model: 'test-model',
            stop_reason: null,
            stop_sequence: null,
            usage: {
              input_tokens: 10,
              output_tokens: 0
            }
          }
        };
        controller.enqueue(
          encoder.encode(`event: message_start\ndata: ${JSON.stringify(messageStart)}\n\n`)
        );

        // 发送content_block_start
        const blockStart = {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'text',
            text: ''
          }
        };
        controller.enqueue(
          encoder.encode(`event: content_block_start\ndata: ${JSON.stringify(blockStart)}\n\n`)
        );

        // 发送测试文本
        const interval = setInterval(() => {
          if (counter < 5) {
            const delta = {
              type: 'content_block_delta',
              index: 0,
              delta: {
                type: 'text_delta',
                text: `Test chunk ${counter + 1}. `
              }
            };
            controller.enqueue(
              encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify(delta)}\n\n`)
            );
            counter++;
          } else {
            clearInterval(interval);

            // 发送结束事件
            const blockStop = {
              type: 'content_block_stop',
              index: 0
            };
            controller.enqueue(
              encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(blockStop)}\n\n`)
            );

            const messageDelta = {
              type: 'message_delta',
              delta: {
                stop_reason: 'end_turn',
                stop_sequence: null
              },
              usage: {
                output_tokens: 20
              }
            };
            controller.enqueue(
              encoder.encode(`event: message_delta\ndata: ${JSON.stringify(messageDelta)}\n\n`)
            );

            const stopEvent = {
              type: 'message_stop'
            };
            controller.enqueue(
              encoder.encode(`event: message_stop\ndata: ${JSON.stringify(stopEvent)}\n\n`)
            );

            controller.close();
          }
        }, 100);
      }
    });
  }

  /**
   * 添加数据保存到流处理pipeline中
   */
  private addDataSavingToStream(stream: ReadableStream, requestId: string, claudeModel: string): ReadableStream {
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    return new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            // 解析流数据
            const chunk = decoder.decode(value, { stream: true });

            // 尝试解析SSE数据来提取实际内容
            try {
              // SSE格式：event: xxx\ndata: {...}\n\n
              const lines = chunk.split('\n');
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const dataStr = line.substring(6);
                  if (dataStr.trim() && !dataStr.includes('[DONE]')) {
                    try {
                      const eventData = JSON.parse(dataStr);
                      // 累计保存流式响应数据到Claude响应文件
                      DataSaver.appendStreamResponse(requestId, 'claude', eventData);
                      // 同时也保存到Gemini响应文件（因为这是转换后的数据）
                      DataSaver.appendStreamResponse(requestId, 'gemini', {
                        original: eventData,
                        claudeModel,
                        timestamp: new Date().toISOString()
                      });
                    } catch (parseError) {
                      // 忽略解析错误，继续处理
                    }
                  }
                }
              }
            } catch (error) {
              // 忽略解析错误，继续传输数据
            }

            // 继续传输原始数据
            controller.enqueue(value);
          }
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
          controller.close();
        }
      }
    });
  }
}