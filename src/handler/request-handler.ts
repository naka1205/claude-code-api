/**
 * 请求处理器 - Cloudflare Workers版本
 * 处理Claude API兼容请求
 */

import { ClaudeRequest, ClaudeCountRequest } from '../types/claude';
import { RequestValidator } from './request-validator';
import { RequestTransformer } from '../transformers/request-transformer';
import { CountTokensTransformer } from '../transformers/count-tokens-transformer';
import { StreamManager } from './stream-manager';
import { ClientManager } from './client-manager';
import { ThinkingTransformer } from '../transformers/thinking-transformer';
import { ResponseManager } from './response-manager';
import { ApiKeyManager } from './api-key-manager';
import { KeyUsageCache } from './key-usage-cache';
import { ApiResponse } from '../client';
import { createErrorContext, maskApiKey, maskSensitiveData } from '../utils/common';
import { Logger } from '../utils/logger';

export interface HandlerConfig {
  enableValidation: boolean;
  env?: any;
  ctx?: any;
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
  async handleMessagesRequest(context: RequestContext, request: Request, requestId: string): Promise<Response> {
    const startTime = Date.now();

    try {
      const claudeRequest = context.body as ClaudeRequest;

      // 记录客户端请求
      Logger.logRequest(requestId, context.pathname, context.method, context.headers, claudeRequest);

      // 1. 提取API密钥
      const apiKeys = this.apiKeyManager.extractApiKeys(context.headers);
      if (!apiKeys || apiKeys.length === 0) {
        Logger.logError(requestId, 'API key required', '401');
        return this.responseManager.createErrorResponse(401, 'API key required');
      }

      // 2. 验证请求
      if (this.config.enableValidation) {
        const validationError = this.validator.validateClaudeRequest(context.body);
        if (validationError) {
          Logger.logError(requestId, validationError, '400');
          return this.responseManager.createErrorResponse(400, validationError);
        }

      }

      // 3. 选择最佳API密钥
      const geminiModel = this.getGeminiModel(claudeRequest.model);
      const selectedKey = await KeyUsageCache.pickBestKey(
        apiKeys,
        geminiModel
      );

      if (!selectedKey) {
        Logger.logError(requestId, 'No available API keys', '429');
        return this.responseManager.createErrorResponse(429, 'No available API keys');
      }

      await KeyUsageCache.reserve(selectedKey);

      let exposeThinkingToClient = false;
      let thinkingBudget: number | undefined = undefined;

      if ((claudeRequest as any).thinking && (claudeRequest as any).thinking.type === 'enabled') {
        const thinkingConfig = ThinkingTransformer.transformThinking(
          (claudeRequest as any).thinking,
          geminiModel,
          claudeRequest
        );
        exposeThinkingToClient = thinkingConfig?.exposeToClient || false;
        thinkingBudget = thinkingConfig?.thinkingBudget;

      } else {
        // 未启用thinking时，使用默认配置（模型可能仍会内部推理）
        const defaultConfig = ThinkingTransformer.transformThinking(
          undefined,
          geminiModel,
          claudeRequest
        );
        thinkingBudget = defaultConfig?.thinkingBudget;
      }

      // 4. 转换请求
      const transformOptions = {
        enableSpecialToolHandling: false,
        maxOutputTokens: claudeRequest.max_tokens,
        safeOutputTokenLimiting: true,
        enableThinking: true  // 总是启用thinking处理，让模型决定是否使用
      };

      const transformResult = await RequestTransformer.transformRequest(claudeRequest, transformOptions);
      const geminiRequest = transformResult.request;


      // 记录警告信息
      if (transformResult.warnings && transformResult.warnings.length > 0) {
        // skip warn logs
      }

      // 5. 创建客户端（使用选定的密钥）
      const client = this.clientManager.createClient([selectedKey]);

      // 6. 确定端点和流式模式
      const isStreamRequest = claudeRequest.stream || false;
      const endpoint = this.getGeminiEndpoint(claudeRequest.model, isStreamRequest);

      // 记录Gemini请求
      Logger.logGeminiRequest(requestId, endpoint, 'POST', { 'Content-Type': 'application/json' }, geminiRequest);

      // 7. 发送请求 - 添加更好的错误处理
      try {
        if (isStreamRequest) {
          // 流式响应
          const streamResponse = await client.sendRequest(endpoint, geminiRequest, true, requestId);

          const duration = Date.now() - startTime;

          if ('stream' in streamResponse) {
            return this.streamManager.handleStreamResponse(
              streamResponse.stream,
              claudeRequest.model,
              streamResponse.headers,
              exposeThinkingToClient,
              requestId,
              geminiModel,
              thinkingBudget
            );
          } else {
            // 非流式错误响应 - 直接转换错误格式返回
            if ((streamResponse as any).statusCode >= 400) {
              await KeyUsageCache.onError(selectedKey, (streamResponse as any).statusCode);
            }
            return await this.responseManager.handleGeminiResponse({
              statusCode: (streamResponse as any).statusCode,
              headers: (streamResponse as any).headers,
              body: (streamResponse as any).body || {},
              isStream: false
            }, claudeRequest.model, exposeThinkingToClient, requestId);
          }
        } else {
          // 非流式响应
          const response = await client.sendRequest(endpoint, geminiRequest, false, requestId);

          const duration = Date.now() - startTime;

          // 错误处理 - 记录密钥错误状态
          if ((response as ApiResponse).statusCode >= 400) {
            await KeyUsageCache.onError(selectedKey, (response as ApiResponse).statusCode);
          }

          return await this.responseManager.handleGeminiResponse(
            response as ApiResponse,
            claudeRequest.model,
            exposeThinkingToClient,
            requestId
          );
        }
      } catch (networkError) {
        // 网络错误 - 记录详细信息并返回错误
        const errorContext = createErrorContext(
          'RequestHandler',
          'handleMessagesRequest - Network Request',
          networkError,
          {
            requestId: requestId,
            selectedKeyMasked: maskApiKey(selectedKey),
            endpoint,
            geminiModel,
            isStream: claudeRequest.stream,
            duration: Date.now() - startTime
          }
        );

        console.error('[RequestHandler] Network error to Gemini API:', {
          ...errorContext,
          networkDetails: {
            timeout: this.clientManager.getTimeout?.() || 'unknown',
            retryable: networkError instanceof Error &&
              ['ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT'].includes((networkError as any).code)
          }
        });

        await KeyUsageCache.onError(selectedKey, 500);
        Logger.logError(requestId, `Failed to connect to Gemini API: ${errorContext.originalError.message}`, '502', errorContext);
        return this.responseManager.createErrorResponse(
          502,
          `Failed to connect to Gemini API: ${errorContext.originalError.message}`
        );
      }

    } catch (error) {
      const errorContext = createErrorContext(
        'RequestHandler',
        'handleMessagesRequest',
        error,
        {
          requestId: requestId,
          context: {
            method: context.method,
            pathname: context.pathname,
            hasBody: !!context.body,
            headers: maskSensitiveData(Object.keys(context.headers)),
            bodyType: context.body ? typeof context.body : 'undefined',
            bodySize: context.body ? JSON.stringify(context.body).length : 0
          },
          duration: Date.now() - startTime
        }
      );

      console.error('[RequestHandler] Messages request error:', errorContext);
      Logger.logError(requestId, errorContext.originalError.message || 'Internal server error', '500', errorContext);

      return this.responseManager.createErrorResponse(
        500,
        errorContext.originalError.message || 'Internal server error'
      );
    }
  }

  /**
   * 处理token计数请求
   */
  async handleCountTokensRequest(context: RequestContext, request: Request, requestId: string): Promise<Response> {
    const startTime = Date.now();

    try {
      const countRequest = context.body as ClaudeCountRequest;

      // 记录count_tokens请求
      Logger.logRequest(requestId, context.pathname, context.method, context.headers, countRequest);

      // 1. 提取API密钥
      const apiKeys = this.apiKeyManager.extractApiKeys(context.headers);
      if (!apiKeys || apiKeys.length === 0) {
        Logger.logError(requestId, 'API key required', '401');
        return this.responseManager.createErrorResponse(401, 'API key required');
      }

      // 2. 验证请求
      const validationError = CountTokensTransformer.validateCountRequest(countRequest);
      if (validationError) {
        Logger.logError(requestId, validationError, '400');
        return this.responseManager.createErrorResponse(400, validationError);
      }

      // 3. 选择最佳API密钥
      const geminiModel = this.getGeminiModel(countRequest.model);
      const selectedKey = await KeyUsageCache.pickBestKey(apiKeys, geminiModel);

      if (!selectedKey) {
        Logger.logError(requestId, 'No available API keys', '429');
        return this.responseManager.createErrorResponse(429, 'No available API keys');
      }

      // 4. 转换请求
      const geminiCountRequest = await CountTokensTransformer.transformCountRequest(countRequest);

      // 5. 创建客户端
      const client = this.clientManager.createClient([selectedKey]);

      // 6. 发送计数请求
      const endpoint = `/v1beta/models/${geminiModel}:countTokens`;
      const response = await client.sendRequest(endpoint, geminiCountRequest, false, requestId);

      // 7. 处理响应
      if ('body' in response && response.body) {
        if (response.statusCode >= 400) {
          await KeyUsageCache.onError(selectedKey, response.statusCode);

          return this.responseManager.createErrorResponse(
            response.statusCode,
            response.body.error?.message || 'Failed to count tokens'
          );
        }

        const claudeResponse = CountTokensTransformer.transformCountResponse(response.body);

        return new Response(
          JSON.stringify(claudeResponse),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache'
            }
          }
        );
      }

      return this.responseManager.createErrorResponse(500, 'Invalid response from Gemini API');

    } catch (error) {
      const errorContext = createErrorContext(
        'RequestHandler',
        'handleCountTokensRequest',
        error,
        {
          requestId: requestId,
          model: context.body?.model,
          duration: Date.now() - startTime
        }
      );

      console.error('[RequestHandler] Count tokens error:', errorContext);
      Logger.logError(requestId, errorContext.originalError.message || 'Internal server error', '500', errorContext);

      return this.responseManager.createErrorResponse(
        500,
        errorContext.originalError.message || 'Internal server error'
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
      const errorContext = createErrorContext(
        'RequestHandler',
        'getGeminiModel',
        error,
        {
          inputModel: model,
          availableModels: ModelMapper.getInstance().getSupportedModels?.() || 'unknown'
        }
      );

      console.error('[RequestHandler] Model mapping error:', errorContext);

      throw new Error(`Unsupported model: ${model}. ${errorContext.originalError.message}`);
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
}

import { ModelMapper } from '../models';