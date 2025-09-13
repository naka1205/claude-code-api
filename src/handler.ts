/**
 * 请求处理器
 * 负责处理 Claude API 请求的核心逻辑
 */

import { RequestTransformer } from './transformers/request';
import { ResponseTransformer } from './transformers/response';
import { StreamTransformer } from './transformers/stream';
import { ModelMapper } from './models';
import { CacheManager } from './cache';
import { RateLimiter, TieredRateLimiter } from './limiter';
import { ClaudeRequest } from './types/claude';
import { GeminiResponse } from './types/gemini';

/**
 * API 密钥提取器
 */
export class ApiKeyExtractor {
  static extract(headers: Headers): string {
    const xApiKey = headers.get('x-api-key');
    if (xApiKey) {
      return xApiKey.trim();
    }

    const auth = headers.get('Authorization');
    if (auth && auth.startsWith('Bearer ')) {
      return auth.substring(7).trim();
    }

    throw new Error('API key required');
  }

  static extractMultiple(headers: Headers): string[] {
    const single = this.extract(headers);
    return single.split(',').map(k => k.trim()).filter(k => k.length >= 10);
  }
}

/**
 * 请求验证器
 */
export class RequestValidator {
  static validate(request: ClaudeRequest): {
    isValid: boolean;
    errors: string[]
  } {
    const errors: string[] = [];

    // 检查必需的 max_tokens 参数
    if (!request.max_tokens && request.max_tokens !== 0) {
      errors.push('max_tokens is required');
    }

    if (!request.model) {
      errors.push('Model is required');
    } else {
      try {
        ModelMapper.mapModel(request.model);
      } catch (e) {
        errors.push(`Unsupported model: ${request.model}`);
      }
    }

    if (!request.messages || request.messages.length === 0) {
      errors.push('Messages are required');
    } else {
      for (let i = 0; i < request.messages.length; i++) {
        const msg = request.messages[i];
        if (!msg.role || !['user', 'assistant', 'system'].includes(msg.role)) {
          errors.push(`Invalid role at message ${i}: ${msg.role}`);
        }
        if (!msg.content && msg.content !== '') {
          errors.push(`Empty content at message ${i}`);
        }
      }
    }

    if (request.max_tokens) {
      if (request.max_tokens < 1) {
        errors.push('max_tokens must be positive');
      }
      const maxAllowed = ModelMapper.getMaxOutputTokens(request.model);
      if (request.max_tokens > maxAllowed) {
        errors.push(`max_tokens exceeds model limit: ${maxAllowed}`);
      }
    }

    if (request.temperature !== undefined) {
      if (request.temperature < 0 || request.temperature > 2) {
        errors.push('temperature must be between 0 and 2');
      }
    }

    if (request.tools && request.tools.length > 0) {
      const modelCapabilities = ModelMapper.getCapabilities(request.model);
      if (!modelCapabilities.supportsTools) {
        errors.push(`Model ${request.model} does not support tools`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

/**
 * 多密钥负载均衡器
 */
export class KeyBalancer {
  private static keyIndex = 0;
  private static cooldowns = new Map<string, number>();

  static selectKey(apiKeys: string[]): string | null {
    const now = Date.now();
    const availableKeys = apiKeys.filter(key => {
      const cooldownUntil = this.cooldowns.get(key) || 0;
      return cooldownUntil <= now;
    });

    if (availableKeys.length === 0) {
      return null;
    }

    const selected = availableKeys[this.keyIndex % availableKeys.length];
    this.keyIndex++;
    return selected;
  }

  static markCooldown(apiKey: string, durationMs: number = 60000): void {
    this.cooldowns.set(apiKey, Date.now() + durationMs);
  }

  static cleanup(): void {
    const now = Date.now();
    for (const [key, cooldownUntil] of this.cooldowns.entries()) {
      if (cooldownUntil <= now) {
        this.cooldowns.delete(key);
      }
    }
  }
}

/**
 * 主请求处理器
 */
export class RequestHandler {
  private cacheManager: CacheManager;
  private rateLimiter: TieredRateLimiter;

  constructor(kv: KVNamespace | undefined) {
    this.cacheManager = new CacheManager(kv as KVNamespace);
    // 只有在 KV 可用时才初始化速率限制器
    if (kv) {
      this.rateLimiter = new TieredRateLimiter(kv);
    } else {
      console.warn('KV namespace not available, rate limiting disabled');
      // 创建一个总是允许的假速率限制器
      this.rateLimiter = {
        checkAllLimits: async () => ({ allowed: true, remaining: 999, resetAt: Date.now() + 60000 }),
        limiters: new Map(),
        addCustomLimit: () => {}
      } as unknown as TieredRateLimiter;
    }
  }

  /**
   * 处理主请求
   */
  async handleRequest(
    request: Request,
    ctx: ExecutionContext
  ): Promise<Response> {
    const startTime = Date.now();

    try {
      // 1. 解析请求
      const claudeRequest: ClaudeRequest = await request.json();

      // 2. 验证请求
      const validation = RequestValidator.validate(claudeRequest);
      if (!validation.isValid) {
        return this.createErrorResponse('Validation failed', 400, {
          validation_errors: validation.errors
        });
      }

      // 3. 速率限制检查
      let rateLimit = { allowed: true, remaining: 10, resetAt: Date.now() + 60000 };
      try {
        const clientId = RateLimiter.getClientIdentifier(request);
        rateLimit = await this.rateLimiter.checkAllLimits(clientId);
      } catch (error) {
        console.error('Rate limit check error:', error);
        // 如果速率限制检查失败，允许请求通过但记录错误
      }

      if (!rateLimit.allowed) {
        return this.createRateLimitResponse(rateLimit.remaining, rateLimit.resetAt);
      }

      // 4. 获取 API 密钥
      const apiKey = this.extractApiKey(request.headers);

      // 5. 检查缓存（仅非流式请求）
      if (!claudeRequest.stream) {
        const cachedResponse = await this.cacheManager.getCachedClaudeResponse(claudeRequest);
        if (cachedResponse) {
          const response = new Response(JSON.stringify(cachedResponse), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'X-Cache': 'HIT'
            }
          });
          return this.addRateLimitHeaders(response, rateLimit);
        }
      }

      // 6. 转换请求
      const geminiRequest = RequestTransformer.transformRequest(claudeRequest, {
        enableSpecialToolHandling: false,
        safeOutputTokenLimiting: true
      });

      // 7. 调用 Gemini API
      const geminiResponse = await this.callGeminiAPI(
        geminiRequest,
        claudeRequest,
        apiKey
      );

      // 8. 处理响应
      let response: Response;
      if (claudeRequest.stream) {
        response = await this.handleStreamResponse(
          geminiResponse,
          claudeRequest
        );
      } else {
        response = await this.handleNormalResponse(
          geminiResponse,
          claudeRequest,
          ctx
        );
      }

      // 9. 添加速率限制头
      response = this.addRateLimitHeaders(response, rateLimit);

      // 10. 记录日志
      this.logRequest(request, claudeRequest, response, Date.now() - startTime);

      return response;

    } catch (error) {
      console.error('Request processing error:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // 根据错误类型返回适当的状态码
      if (errorMessage.startsWith('API_KEY_INVALID:')) {
        return this.createErrorResponse('Invalid API key', 401, {
          message: errorMessage.replace('API_KEY_INVALID: ', '')
        });
      }

      if (errorMessage.startsWith('RATE_LIMIT:')) {
        return this.createErrorResponse('Rate limit exceeded', 429, {
          message: errorMessage.replace('RATE_LIMIT: ', '')
        });
      }

      if (errorMessage.startsWith('TOOL_VALIDATION:')) {
        return this.createErrorResponse('Invalid tool definition', 400, {
          message: errorMessage.replace('TOOL_VALIDATION: ', '')
        });
      }

      if (errorMessage.includes('Unsupported') || errorMessage.includes('validation')) {
        return this.createErrorResponse('Bad request', 400, {
          message: errorMessage
        });
      }

      return this.createErrorResponse(
        'Internal server error',
        500,
        { message: errorMessage }
      );
    }
  }

  /**
   * 提取 API 密钥
   */
  private extractApiKey(headers: Headers): string {
    try {
      const apiKeys = ApiKeyExtractor.extractMultiple(headers);
      const selectedKey = KeyBalancer.selectKey(apiKeys);

      if (!selectedKey) {
        throw new Error('All API keys are in cooldown');
      }

      return selectedKey;
    } catch (e) {
      // 单密钥模式
      return ApiKeyExtractor.extract(headers);
    }
  }

  /**
   * 调用 Gemini API
   */
  private async callGeminiAPI(
    geminiRequest: any,
    claudeRequest: ClaudeRequest,
    apiKey: string
  ): Promise<Response> {
    const modelName = claudeRequest.model || 'claude-3-5-sonnet-20241022';
    const geminiModel = ModelMapper.mapModel(modelName);
    const isStream = claudeRequest.stream === true;
    const endpoint = isStream ? 'streamGenerateContent' : 'generateContent';

    // 对于流式请求，添加 alt=sse 参数以获取 Server-Sent Events 格式
    const streamParams = isStream ? '&alt=sse' : '';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:${endpoint}?key=${apiKey}${streamParams}`;

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(geminiRequest)
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData: any;

      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }

      // 处理 API 密钥错误
      if (response.status === 400 && errorData?.error?.message?.includes('API key')) {
        throw new Error(`API_KEY_INVALID: ${errorData.error.message}`);
      }

      // 处理速率限制
      if (response.status === 429 || response.status === 403) {
        KeyBalancer.markCooldown(apiKey, 60000);
        throw new Error(`RATE_LIMIT: ${errorData?.error?.message || 'Rate limit exceeded'}`);
      }

      // 处理工具验证错误
      if (response.status === 400 && errorData?.error?.message?.includes('function')) {
        throw new Error(`TOOL_VALIDATION: ${errorData.error.message}`);
      }

      throw new Error(`Gemini API error: ${errorText}`);
    }

    return response;
  }

  /**
   * 处理流式响应
   */
  private async handleStreamResponse(
    geminiResponse: Response,
    claudeRequest: ClaudeRequest
  ): Promise<Response> {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // 异步处理流
    (async () => {
      try {
        const reader = geminiResponse.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';
        let isFirstChunk = true;
        let contentIndex = 0;
        let accumulatedText = '';

        // 发送 message_start 事件
        const messageStartEvent = {
          type: 'message_start',
          message: {
            id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'message',
            role: 'assistant',
            model: claudeRequest.model || 'claude-3-5-sonnet-20241022',
            content: [],
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 }
          }
        };
        await writer.write(
          encoder.encode(`data: ${JSON.stringify(messageStartEvent)}\n\n`)
        );

        // 发送 content_block_start 事件
        const contentBlockStartEvent = {
          type: 'content_block_start',
          index: contentIndex,
          content_block: {
            type: 'text',
            text: ''
          }
        };
        await writer.write(
          encoder.encode(`data: ${JSON.stringify(contentBlockStartEvent)}\n\n`)
        );

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim().startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') continue;

              try {
                const geminiChunk = JSON.parse(data);

                // Log the entire chunk for debugging
                console.log('Gemini chunk:', JSON.stringify(geminiChunk).substring(0, 500));

                // 检查是否有文本内容
                if (geminiChunk.candidates?.[0]?.content?.parts?.[0]?.text) {
                  const newText = geminiChunk.candidates[0].content.parts[0].text;

                  // Debug logging
                  console.log('Gemini chunk text:', {
                    accumulated: accumulatedText.length,
                    newText: newText.length,
                    preview: newText.substring(0, 50)
                  });

                  // 计算增量文本（新文本减去已累积的文本）
                  let deltaText = '';
                  if (newText.startsWith(accumulatedText)) {
                    deltaText = newText.substring(accumulatedText.length);
                    accumulatedText = newText;
                  } else {
                    // 如果不是增量，则直接使用新文本
                    deltaText = newText;
                    accumulatedText = newText;
                  }

                  if (deltaText) {
                    const contentDeltaEvent = {
                      type: 'content_block_delta',
                      index: contentIndex,
                      delta: { type: 'text_delta', text: deltaText }
                    };
                    await writer.write(
                      encoder.encode(`data: ${JSON.stringify(contentDeltaEvent)}\n\n`)
                    );
                  }
                } else {
                  console.log('No text in chunk, candidates:', geminiChunk.candidates?.[0]);
                }

                // 处理 usage metadata
                if (geminiChunk.usageMetadata) {
                  const messageDeltaEvent = {
                    type: 'message_delta',
                    delta: {},
                    usage: {
                      output_tokens: geminiChunk.usageMetadata.candidatesTokenCount || 0
                    }
                  };
                  await writer.write(
                    encoder.encode(`data: ${JSON.stringify(messageDeltaEvent)}\n\n`)
                  );
                }
              } catch (e) {
                console.error('Error parsing chunk:', e, 'Data:', data.substring(0, 200));
              }
            }
          }
        }

        // 发送 content_block_stop 事件
        const contentBlockStopEvent = {
          type: 'content_block_stop',
          index: contentIndex
        };
        await writer.write(
          encoder.encode(`data: ${JSON.stringify(contentBlockStopEvent)}\n\n`)
        );

        // 发送 message_stop 事件
        const messageStopEvent = {
          type: 'message_stop'
        };
        await writer.write(
          encoder.encode(`data: ${JSON.stringify(messageStopEvent)}\n\n`)
        );

        await writer.write(encoder.encode('data: [DONE]\n\n'));
      } catch (error) {
        console.error('Stream processing error:', error);

        // 发送错误事件
        const errorEvent = {
          type: 'error',
          error: {
            type: 'api_error',
            message: error instanceof Error ? error.message : 'Stream processing failed'
          }
        };
        await writer.write(
          encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`)
        );
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Cache': 'BYPASS'
      }
    });
  }

  /**
   * 处理非流式响应
   */
  private async handleNormalResponse(
    geminiResponse: Response,
    claudeRequest: ClaudeRequest,
    ctx: ExecutionContext
  ): Promise<Response> {
    const geminiData: GeminiResponse = await geminiResponse.json();
    const claudeResponse = ResponseTransformer.transformResponse(
      geminiData,
      claudeRequest.model
    );

    // 异步缓存响应
    ctx.waitUntil(
      this.cacheManager.cacheClaudeResponse(claudeRequest, claudeResponse)
    );

    return new Response(JSON.stringify(claudeResponse), {
      headers: {
        'Content-Type': 'application/json',
        'X-Cache': 'MISS'
      }
    });
  }

  /**
   * 创建错误响应
   */
  private createErrorResponse(
    error: string,
    status: number,
    details?: any
  ): Response {
    return new Response(JSON.stringify({
      error: {
        type: 'api_error',
        message: error,
        ...(details && { details })
      }
    }), {
      status,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * 创建速率限制响应
   */
  private createRateLimitResponse(
    remaining: number,
    resetAt: number
  ): Response {
    const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);

    return new Response(JSON.stringify({
      error: 'Rate limit exceeded',
      message: 'Too many requests. Please try again later.',
      retryAfter
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': retryAfter.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': new Date(resetAt).toISOString()
      }
    });
  }

  /**
   * 添加速率限制头
   */
  private addRateLimitHeaders(
    response: Response,
    rateLimit: { remaining: number; resetAt: number }
  ): Response {
    const newHeaders = new Headers(response.headers);
    newHeaders.set('X-RateLimit-Limit', '10');
    newHeaders.set('X-RateLimit-Remaining', rateLimit.remaining.toString());
    newHeaders.set('X-RateLimit-Reset', new Date(rateLimit.resetAt).toISOString());

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  }

  /**
   * 记录请求日志
   */
  private logRequest(
    request: Request,
    claudeRequest: ClaudeRequest,
    response: Response,
    duration: number
  ): void {
    console.log({
      timestamp: new Date().toISOString(),
      method: request.method,
      url: request.url,
      model: claudeRequest.model,
      messages: claudeRequest.messages.length,
      stream: claudeRequest.stream || false,
      status: response.status,
      duration: `${duration}ms`,
      cache: response.headers.get('X-Cache') || 'MISS'
    });
  }
}