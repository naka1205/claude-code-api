/**
 * 请求处理器 - Cloudflare Workers版本
 * 处理Claude API兼容请求
 */

import { ClaudeRequest, ClaudeCountRequest } from '../types/claude';
import { RequestValidator } from './request-validator';
import { RequestTransformer } from '../transformers/request-transformer';
import { StreamManager } from './stream-manager';
import { ClientManager } from './client-manager';
import { ThinkingTransformer } from '../transformers/thinking-transformer';
import { logger, createRequestLogger } from '../middlewares/logger';
import { ResponseManager } from './response-manager';
import { ApiKeyManager } from './api-key-manager';
import { KeyUsageCache } from './key-usage-cache';
import { ApiResponse } from '../client';
import { generateRequestId } from '../utils/common';

export interface HandlerConfig {
  enableValidation: boolean;
  enableLogging: boolean;
  env?: any;
  ctx?: any;
  kv?: KVNamespace;
}

export interface RequestContext {
  method: string;
  url: string;
  pathname: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body?: any;
}

export class RequestHandler {
  private config: HandlerConfig;
  private validator: RequestValidator;
  private streamManager: StreamManager;
  private responseManager: ResponseManager;
  private apiKeyManager: ApiKeyManager;
  private clientManager: ClientManager;

  constructor(config: HandlerConfig) {
    this.config = config;
    this.validator = new RequestValidator();
    this.streamManager = new StreamManager();
    this.responseManager = new ResponseManager();
    this.apiKeyManager = new ApiKeyManager();
    this.clientManager = new ClientManager(config);
  }

  /**
   * 处理消息请求
   */
  async handleMessagesRequest(context: RequestContext, request: Request, requestId?: string): Promise<Response> {
    const finalRequestId = requestId || generateRequestId();
    const requestLogger = createRequestLogger(finalRequestId);
    logger.setRequestId(finalRequestId);
    const startTime = Date.now();

    try {
      // 记录请求详情
      logger.request(context.method, context.url, context.headers, context.body);

      // 记录请求参数摘要
      if (this.config.enableLogging) {
        this.logRequestSummary(context.body as ClaudeRequest, requestLogger);
      }
      // 1. 提取API密钥
      const apiKeys = this.apiKeyManager.extractApiKeys(context.headers);
      if (!apiKeys || apiKeys.length === 0) {
        return this.responseManager.createErrorResponse(401, 'API key required');
      }

      // 2. 验证请求
      if (this.config.enableValidation) {
        const validationError = this.validator.validateClaudeRequest(context.body);
        if (validationError) {
          logger.validation(false, [validationError], finalRequestId);
          return this.responseManager.createErrorResponse(400, validationError);
        }
        logger.validation(true, undefined, finalRequestId);
      }

      const claudeRequest = context.body as ClaudeRequest;

      // 3. 选择最佳API密钥
      const geminiModel = this.getGeminiModel(claudeRequest.model);
      const selectedKey = await KeyUsageCache.pickBestKey(
        apiKeys,
        geminiModel,
        this.config.kv
      );

      if (!selectedKey) {
        return this.responseManager.createErrorResponse(429, 'No available API keys');
      }

      // 记录密钥使用
      await KeyUsageCache.reserve(selectedKey, this.config.kv);

      if (this.config.enableLogging) {
        requestLogger.info('Using API key', {
          keyIndex: apiKeys.indexOf(selectedKey) + 1,
          totalKeys: apiKeys.length,
          maskedKey: selectedKey.substring(0, 11) + '***'
        });
      }

      // 提取thinking配置
      let exposeThinkingToClient = false;
      if ((claudeRequest as any).thinking && (claudeRequest as any).thinking.type === 'enabled') {
        const thinkingConfig = ThinkingTransformer.transformThinking(
          (claudeRequest as any).thinking,
          this.getGeminiModel(claudeRequest.model),
          claudeRequest
        );
        exposeThinkingToClient = thinkingConfig?.exposeToClient || false;
      }

      // 4. 转换请求
      const transformOptions = {
        enableSpecialToolHandling: false,
        maxOutputTokens: claudeRequest.max_tokens,
        safeOutputTokenLimiting: true
      };

      const transformResult = await RequestTransformer.transformRequest(claudeRequest, transformOptions);
      const geminiRequest = transformResult.request;

      logger.transformation('request', claudeRequest.model, geminiModel, finalRequestId);

      if (this.config.enableLogging) {
        this.logTransformedRequest(geminiRequest, requestLogger);
      }

      // 添加调试日志
      if (claudeRequest.tools && claudeRequest.tools.length > 0) {
        logger.info(`[Request] Contains ${claudeRequest.tools.length} tools`);
      }
      if (geminiRequest.tools && geminiRequest.tools.length > 0) {
        logger.info(`[Request] Transformed to ${geminiRequest.tools.length} Gemini tools`);
      }

      // 记录警告信息
      if (transformResult.warnings && transformResult.warnings.length > 0) {
        transformResult.warnings.forEach(warning => {
          requestLogger.warn(`Transform Warning - ${warning.type}: ${warning.message}`);
        });
      }

      // 5. 创建客户端（使用选定的密钥）
      const client = this.clientManager.createClient([selectedKey]);

      // 6. 确定端点
      const endpoint = this.getGeminiEndpoint(claudeRequest.model, claudeRequest.stream);
      logger.apiCall(endpoint, 'POST', finalRequestId);

      // 7. 发送请求 - 添加更好的错误处理
      try {
        if (claudeRequest.stream) {
          // 流式响应
          logger.info('[RequestHandler] Sending stream request to:', endpoint);
          const streamResponse = await client.sendRequest(endpoint, geminiRequest, true);

          const duration = Date.now() - startTime;
          logger.apiResponse(endpoint, 200, duration, finalRequestId);

          if ('stream' in streamResponse) {
            return this.streamManager.handleStreamResponse(
              streamResponse.stream,
              claudeRequest.model,
              streamResponse.headers,
              exposeThinkingToClient
            );
          } else {
            // 非流式错误响应 - 直接转换错误格式返回
            if ((streamResponse as any).statusCode >= 400) {
              await KeyUsageCache.onError(selectedKey, (streamResponse as any).statusCode, this.config.kv);
            }
            return await this.responseManager.handleGeminiResponse({
              statusCode: (streamResponse as any).statusCode,
              headers: (streamResponse as any).headers,
              body: (streamResponse as any).body || {},
              isStream: false
            }, claudeRequest.model);
          }
        } else {
          // 非流式响应
          logger.info('[RequestHandler] Sending non-stream request to:', endpoint);
          const response = await client.sendRequest(endpoint, geminiRequest, false);

          const duration = Date.now() - startTime;
          logger.apiResponse(endpoint, (response as ApiResponse).statusCode, duration, finalRequestId);

          // 错误处理 - 记录密钥错误状态
          if ((response as ApiResponse).statusCode >= 400) {
            await KeyUsageCache.onError(selectedKey, (response as ApiResponse).statusCode, this.config.kv);
          }

          return await this.responseManager.handleGeminiResponse(
            response as ApiResponse,
            claudeRequest.model,
            exposeThinkingToClient
          );
        }
      } catch (networkError) {
        // 网络错误 - 记录并直接返回错误
        await KeyUsageCache.onError(selectedKey, 500, this.config.kv);
        logger.error('Network error calling Gemini API:', networkError);
        return this.responseManager.createErrorResponse(
          502,
          `Failed to connect to Gemini API: ${networkError instanceof Error ? networkError.message : 'Network error'}`
        );
      }

      // 记录请求完成统计
      if (this.config.enableLogging) {
        const duration = Date.now() - startTime;
        requestLogger.info('Request completed', {
          duration,
          stream: !!claudeRequest.stream,
          model: claudeRequest.model
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      requestLogger.error('Request handling error', {
        message: errorMessage,
        stack: errorStack,
        error: error
      });

      logger.error('Request handling error:', {
        message: errorMessage,
        stack: errorStack,
        type: typeof error,
        error: error
      });

      return this.responseManager.createErrorResponse(
        500,
        errorMessage || 'Internal server error'
      );
    }
  }

  /**
   * 处理token计数请求
   */
  async handleCountTokensRequest(context: RequestContext, request: Request, requestId?: string): Promise<Response> {
    const finalRequestId = requestId || generateRequestId();
    logger.setRequestId(finalRequestId);

    try {
      // 1. 提取API密钥
      const apiKeys = this.apiKeyManager.extractApiKeys(context.headers);
      if (!apiKeys || apiKeys.length === 0) {
        return this.responseManager.createErrorResponse(401, 'API key required');
      }

      // 2. 验证请求
      if (this.config.enableValidation) {
        const validationError = this.validator.validateCountRequest(context.body);
        if (validationError) {
          return this.responseManager.createErrorResponse(400, validationError);
        }
      }

      const countRequest = context.body as ClaudeCountRequest;

      // 3. 选择最佳API密钥
      const selectedKey = await KeyUsageCache.pickBestKey(
        apiKeys,
        this.getGeminiModel(countRequest.model),
        this.config.kv
      );

      if (!selectedKey) {
        return this.responseManager.createErrorResponse(429, 'No available API keys');
      }

      // 4. 转换为Gemini格式（用于计数）
      const transformResult = await RequestTransformer.transformRequest({
        ...countRequest,
        max_tokens: 1
      } as ClaudeRequest);
      const geminiRequest = transformResult.request;

      // 5. 创建客户端（使用选定的密钥）
      const client = this.clientManager.createClient([selectedKey]);

      // 6. 发送计数请求
      const endpoint = this.getCountEndpoint(countRequest.model);
      const response = await client.sendRequest(endpoint, geminiRequest, false);

      // 7. 处理响应
      if ('body' in response && response.body) {
        const totalTokens = response.body.totalTokens || 0;
        return new Response(
          JSON.stringify({ input_tokens: totalTokens }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache'
            }
          }
        );
      }

      return this.responseManager.createErrorResponse(500, 'Failed to count tokens');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      logger.error('Count request error:', {
        message: errorMessage,
        stack: errorStack,
        type: typeof error,
        error: error
      });

      return this.responseManager.createErrorResponse(
        500,
        errorMessage || 'Internal server error'
      );
    }
  }

  /**
   * 获取Gemini模型名称
   */
  private getGeminiModel(model: string): string {
    try {
      const modelMapper = ModelMapper.getInstance();
      return modelMapper.mapModel(model);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Model mapping error:', {
        model,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw new Error(`Unsupported model: ${model}. ${errorMessage}`);
    }
  }

  /**
   * 获取Gemini端点
   */
  private getGeminiEndpoint(model: string, isStream?: boolean): string {
    const geminiModel = this.getGeminiModel(model);
    const action = isStream ? 'streamGenerateContent' : 'generateContent';
    return `/v1beta/models/${geminiModel}:${action}`;
  }

  /**
   * 获取计数端点
   */
  private getCountEndpoint(model: string): string {
    const geminiModel = this.getGeminiModel(model);
    return `/v1beta/models/${geminiModel}:countTokens`;
  }

  /**
   * 记录请求摘要
   */
  private logRequestSummary(claudeRequest: ClaudeRequest, requestLogger: any): void {
    try {
      requestLogger.info('Incoming Claude request params', {
        model: claudeRequest?.model,
        stream: !!claudeRequest?.stream,
        max_tokens: claudeRequest?.max_tokens,
        messages_count: Array.isArray(claudeRequest?.messages) ? claudeRequest.messages.length : 0,
        tools_count: Array.isArray(claudeRequest?.tools) ? claudeRequest.tools.length : 0,
        temperature: claudeRequest?.temperature,
        top_p: claudeRequest?.top_p,
        top_k: claudeRequest?.top_k,
        has_thinking: !!(claudeRequest as any)?.thinking
      });
    } catch (error) {
      // 忽略日志记录错误
    }
  }

  /**
   * 记录转换后的请求
   */
  private logTransformedRequest(geminiRequest: any, requestLogger: any): void {
    try {
      const summary = {
        contents_count: Array.isArray(geminiRequest?.contents) ? geminiRequest.contents.length : 0,
        thinking: geminiRequest?.generationConfig?.thinkingConfig ? {
          includeThoughts: geminiRequest.generationConfig.thinkingConfig.includeThoughts,
          thinkingBudget: geminiRequest.generationConfig.thinkingConfig.thinkingBudget
        } : undefined,
        maxOutputTokens: geminiRequest?.generationConfig?.maxOutputTokens,
        temperature: geminiRequest?.generationConfig?.temperature,
        topP: geminiRequest?.generationConfig?.topP,
        topK: geminiRequest?.generationConfig?.topK,
        tools_count: Array.isArray(geminiRequest?.tools) ? geminiRequest.tools.length : 0,
        tool_functions_total: Array.isArray(geminiRequest?.tools)
          ? geminiRequest.tools.reduce((sum: number, t: any) => sum + (Array.isArray(t.functionDeclarations) ? t.functionDeclarations.length : 0), 0)
          : 0,
        tool_names: Array.isArray(geminiRequest?.tools)
          ? geminiRequest.tools.flatMap((t: any) => Array.isArray(t.functionDeclarations) ? t.functionDeclarations.map((f: any) => f.name) : [])
          : [],
        tool_mode: geminiRequest?.toolConfig?.functionCallingConfig?.mode
      };

      requestLogger.info('Outgoing Gemini request (summary)', summary);
      requestLogger.debug('Outgoing Gemini request (details)', { geminiRequest });
    } catch (error) {
      // 忽略日志记录错误
    }
  }
}

import { ModelMapper } from '../models';