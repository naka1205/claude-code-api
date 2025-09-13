/**
 * 请求处理器 - Cloudflare Workers版本
 * 处理Claude API兼容请求
 */

import { ClaudeRequest, ClaudeCountRequest } from '../types/claude';
import { RequestValidator } from './request-validator';
import { RequestTransformer } from '../transformers/request-transformer';
import { ResponseTransformer } from '../transformers/response-transformer';
import { StreamManager } from './stream-manager';
import { ClientManager } from './client-manager';
import { ResponseManager } from './response-manager';
import { ApiKeyManager } from './api-key-manager';
import { ApiResponse } from '../client';

export interface HandlerConfig {
  enableValidation: boolean;
  enableLogging: boolean;
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
  async handleMessagesRequest(context: RequestContext, request: Request): Promise<Response> {
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

      // 3. 转换请求
      const geminiRequest = await RequestTransformer.transformRequest(claudeRequest);

      // 4. 创建客户端
      const client = this.clientManager.createClient(apiKeys);

      // 5. 确定端点
      const endpoint = this.getGeminiEndpoint(claudeRequest.model, claudeRequest.stream);

      // 6. 发送请求
      if (claudeRequest.stream) {
        // 流式响应
        const streamResponse = await client.sendRequest(endpoint, geminiRequest, true);

        if ('stream' in streamResponse) {
          return this.streamManager.handleStreamResponse(
            streamResponse.stream,
            claudeRequest.model,
            streamResponse.headers
          );
        } else {
          // 非流式错误响应
          return this.responseManager.handleGeminiResponse({
            statusCode: (streamResponse as any).statusCode,
            headers: (streamResponse as any).headers,
            body: (streamResponse as any).body || {},
            isStream: false
          }, claudeRequest.model);
        }
      } else {
        // 非流式响应
        const response = await client.sendRequest(endpoint, geminiRequest, false);
        return this.responseManager.handleGeminiResponse(response as ApiResponse, claudeRequest.model);
      }

    } catch (error) {
      console.error('Request handling error:', error);
      return this.responseManager.createErrorResponse(
        500,
        error instanceof Error ? error.message : 'Internal server error'
      );
    }
  }

  /**
   * 处理token计数请求
   */
  async handleCountTokensRequest(context: RequestContext, request: Request): Promise<Response> {
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

      // 3. 转换为Gemini格式（用于计数）
      const geminiRequest = await RequestTransformer.transformRequest({
        ...countRequest,
        max_tokens: 1
      } as ClaudeRequest);

      // 4. 创建客户端
      const client = this.clientManager.createClient(apiKeys);

      // 5. 发送计数请求
      const endpoint = this.getCountEndpoint(countRequest.model);
      const response = await client.sendRequest(endpoint, geminiRequest, false);

      // 6. 处理响应
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
      console.error('Count request error:', error);
      return this.responseManager.createErrorResponse(
        500,
        error instanceof Error ? error.message : 'Internal server error'
      );
    }
  }

  /**
   * 获取Gemini端点
   */
  private getGeminiEndpoint(model: string, isStream?: boolean): string {
    const modelMapper = ModelMapper.getInstance();
    const geminiModel = modelMapper.mapModel(model);
    const action = isStream ? 'streamGenerateContent' : 'generateContent';
    return `/v1beta/models/${geminiModel}:${action}`;
  }

  /**
   * 获取计数端点
   */
  private getCountEndpoint(model: string): string {
    const modelMapper = ModelMapper.getInstance();
    const geminiModel = modelMapper.mapModel(model);
    return `/v1beta/models/${geminiModel}:countTokens`;
  }
}

import { ModelMapper } from '../models';