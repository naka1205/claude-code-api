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
import { ResponseManager } from './response-manager';
import { ApiKeyManager } from './api-key-manager';
import { KeyUsageCache } from './key-usage-cache';
import { ApiResponse } from '../client';
import { generateRequestId, createErrorContext, maskApiKey, maskSensitiveData } from '../utils/common';

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
  async handleMessagesRequest(context: RequestContext, request: Request, requestId?: string): Promise<Response> {
    const finalRequestId = requestId || generateRequestId();
    const startTime = Date.now();
    // 使用 requestId 作为会话ID（Claude Code 官方命令行工具）
    const sessionId = finalRequestId;
    console.log(`[RequestDebug] New request started:`, {
      requestId: finalRequestId,
      sessionId,
      method: context.method,
      pathname: context.pathname
    });

    try {
      

      // 1. 提取API密钥
      const apiKeys = this.apiKeyManager.extractApiKeys(context.headers);
      if (!apiKeys || apiKeys.length === 0) {
        return this.responseManager.createErrorResponse(401, 'API key required');
      }

      // 2. 验证请求
      if (this.config.enableValidation) {
        const validationError = this.validator.validateClaudeRequest(context.body);
        if (validationError) {
          
          return this.responseManager.createErrorResponse(400, validationError);
        }
        
      }

      const claudeRequest = context.body as ClaudeRequest;

      // 3. 选择最佳API密钥
      const geminiModel = this.getGeminiModel(claudeRequest.model);
      const selectedKey = await KeyUsageCache.pickBestKey(
        apiKeys,
        geminiModel
      );

      if (!selectedKey) {
        return this.responseManager.createErrorResponse(429, 'No available API keys');
      }

      // 记录密钥使用
      await KeyUsageCache.reserve(selectedKey);


      // 提取thinking配置
      let exposeThinkingToClient = false;

      console.log(`[ThinkingDebug] Client thinking request:`, {
        requestId: finalRequestId,
        hasThinkingConfig: !!(claudeRequest as any).thinking,
        thinkingType: (claudeRequest as any).thinking?.type,
        claudeModel: claudeRequest.model,
        geminiModel,
        isGemini25Pro: geminiModel === 'gemini-2.5-pro'
      });

      if ((claudeRequest as any).thinking && (claudeRequest as any).thinking.type === 'enabled') {
        const thinkingConfig = ThinkingTransformer.transformThinking(
          (claudeRequest as any).thinking,
          geminiModel,
          claudeRequest
        );
        exposeThinkingToClient = thinkingConfig?.exposeToClient || false;

        console.log(`[ThinkingDebug] Client enabled thinking - config generated:`, {
          requestId: finalRequestId,
          thinkingConfig,
          exposeThinkingToClient,
          modelSupportsThinking: ThinkingTransformer.modelSupportsThinking(geminiModel)
        });
      } else {
        // 客户端未启用thinking，但检查Gemini 2.5系列模型
        console.log(`[ThinkingDebug] Client did NOT enable thinking:`, {
          requestId: finalRequestId,
          claudeModel: claudeRequest.model,
          geminiModel,
          isGemini25Series: geminiModel.startsWith('gemini-2.5'),
          willForceThinking: geminiModel === 'gemini-2.5-pro' // Pro不能禁用
        });

        if (geminiModel === 'gemini-2.5-pro') {
          console.log(`[ThinkingDebug] CRITICAL: Gemini 2.5 Pro cannot disable thinking, but client did not enable thinking exposure`);
        }
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

      // 添加thinking相关的调试日志
      console.log(`[ThinkingDebug] Request transformation completed:`, {
        requestId: finalRequestId,
        geminiModel,
        hasGenerationConfig: !!geminiRequest.generationConfig,
        thinkingBudget: geminiRequest.generationConfig?.thinkingConfig?.thinkingBudget,
        exposeThinkingToClient,
        geminiRequestStructure: {
          systemInstruction: !!geminiRequest.systemInstruction,
          contents: geminiRequest.contents?.length || 0,
          tools: geminiRequest.tools?.length || 0,
          generationConfig: Object.keys(geminiRequest.generationConfig || {})
        }
      });

      // 记录警告信息
      if (transformResult.warnings && transformResult.warnings.length > 0) {
        // skip warn logs
      }

      // 5. 创建客户端（使用选定的密钥）
      const client = this.clientManager.createClient([selectedKey]);

      // 6. 确定端点和流式模式
      // Flash模型thinking模式兼容性修复：强制使用流式API
      // 当Flash模型启用thinking且有工具时，非流式API会产生MALFORMED_FUNCTION_CALL
      let forceStream = claudeRequest.stream;

      console.log(`[RequestHandler][FlashThinkingCheck] Checking force stream conditions:`, {
        originalStream: claudeRequest.stream,
        geminiModel,
        isFlashModel: geminiModel.includes('flash'),
        thinkingBudget: geminiRequest.generationConfig?.thinkingConfig?.thinkingBudget,
        thinkingBudgetNotZero: geminiRequest.generationConfig?.thinkingConfig?.thinkingBudget !== 0,
        hasTools: !!(geminiRequest.tools && geminiRequest.tools.length > 0),
        toolsLength: geminiRequest.tools?.length || 0
      });

      if (!forceStream &&
          geminiModel.includes('flash') &&
          geminiRequest.generationConfig?.thinkingConfig?.thinkingBudget !== 0 &&
          geminiRequest.tools && geminiRequest.tools.length > 0) {

        console.log(`[RequestHandler][FlashThinkingFix] Forcing stream mode for Flash model with thinking + tools to avoid MALFORMED_FUNCTION_CALL`);
        forceStream = true;
      }

      const endpoint = this.getGeminiEndpoint(claudeRequest.model, forceStream);

      console.log(`[RequestHandler][FlashThinkingResult] Final request configuration:`, {
        originalStream: claudeRequest.stream,
        forceStream,
        endpoint,
        willUseStream: forceStream
      });

      // 7. 发送请求 - 添加更好的错误处理
      try {
        if (forceStream) {
          // 流式响应（包括强制流式）

          const streamResponse = await client.sendRequest(endpoint, geminiRequest, true);

          const duration = Date.now() - startTime;

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
              await KeyUsageCache.onError(selectedKey, (streamResponse as any).statusCode);
            }
            return await this.responseManager.handleGeminiResponse({
              statusCode: (streamResponse as any).statusCode,
              headers: (streamResponse as any).headers,
              body: (streamResponse as any).body || {},
              isStream: false
            }, claudeRequest.model, exposeThinkingToClient);
          }
        } else {
          // 非流式响应
          const response = await client.sendRequest(endpoint, geminiRequest, false);

          const duration = Date.now() - startTime;

          // 错误处理 - 记录密钥错误状态
          if ((response as ApiResponse).statusCode >= 400) {
            await KeyUsageCache.onError(selectedKey, (response as ApiResponse).statusCode);
          }

          return await this.responseManager.handleGeminiResponse(
            response as ApiResponse,
            claudeRequest.model,
            exposeThinkingToClient
          );
        }
      } catch (networkError) {
        // 网络错误 - 记录详细信息并返回错误
        const errorContext = createErrorContext(
          'RequestHandler',
          'handleMessagesRequest - Network Request',
          networkError,
          {
            requestId: finalRequestId,
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
          requestId: finalRequestId,
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

      return this.responseManager.createErrorResponse(
        500,
        errorContext.originalError.message || 'Internal server error'
      );
    }
  }

  /**
   * 处理token计数请求
   */
  async handleCountTokensRequest(context: RequestContext, request: Request, requestId?: string): Promise<Response> {
    const finalRequestId = requestId || generateRequestId();

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
        this.getGeminiModel(countRequest.model)
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
      const errorContext = createErrorContext(
        'RequestHandler',
        'handleCountTokensRequest',
        error,
        {
          requestId: finalRequestId,
          context: {
            method: context.method,
            pathname: context.pathname,
            model: context.body?.model,
            hasMessages: !!(context.body?.messages),
            messageCount: context.body?.messages?.length || 0
          }
        }
      );

      console.error('[RequestHandler] Count tokens request error:', errorContext);

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

  /**
   * 获取计数端点
   */
  private getCountEndpoint(model: string): string {
    const geminiModel = this.getGeminiModel(model);
    return `/v1beta/models/${geminiModel}:countTokens`;
  }
}

import { ModelMapper } from '../models';