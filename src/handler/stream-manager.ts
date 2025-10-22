/**
 * 流管理器 - Cloudflare Workers版本
 * 处理SSE流式响应
 */

import { StreamTransformer } from '../transformers/stream-transformer';

export class StreamManager {
  /**
   * 处理流式响应
   */
  handleStreamResponse(
    stream: ReadableStream,
    claudeModel: string,
    headers: Record<string, string>,
    exposeThinkingToClient: boolean = false,
    requestId?: string,
    geminiModel?: string,
    thinkingBudget?: number
  ): Response {
    try {
      // 创建转换后的流
      const transformedStream = StreamTransformer.createStreamPipeline(
        stream,
        claudeModel,
        exposeThinkingToClient,
        requestId,
        geminiModel,
        thinkingBudget
      );

      // 返回SSE响应
      return new Response(transformedStream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version',
          'Access-Control-Allow-Credentials': 'true',
          'X-Accel-Buffering': 'no',
          'X-Content-Type-Options': 'nosniff'
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
}
