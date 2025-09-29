/**
 * Gemini API客户端 - Cloudflare Workers版本
 * 使用Fetch API处理对Gemini API的HTTP调用
 */

import { headersToObject } from './utils/common';
import { TIMEOUTS } from './utils/constants';

/**
 * API客户端配置
 */
export interface ApiClientConfig {
  baseUrl?: string;
  timeout?: number;
}

/**
 * API响应接口
 */
export interface ApiResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  isStream: boolean;
}

/**
 * 流式响应接口
 */
export interface StreamResponse {
  statusCode: number;
  headers: Record<string, string>;
  stream: ReadableStream;
}

/**
 * Gemini API客户端 - Workers版本
 */
export class GeminiApiClient {
  private apiKeys: string[];
  private baseUrl: string;
  private timeout: number;

  constructor(apiKeys: string | string[], config: ApiClientConfig = {}) {
    this.apiKeys = Array.isArray(apiKeys) ? apiKeys : [apiKeys];
    this.baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com';
    this.timeout = config.timeout || TIMEOUTS.API_CALL;

    if (this.apiKeys.length === 0) {
      throw new Error('At least one API key is required');
    }

    
  }

  /**
   * 随机选择一个API密钥
   */
  private selectRandomApiKey(): string {
    const randomIndex = Math.floor(Math.random() * this.apiKeys.length);
    const selectedKey = this.apiKeys[randomIndex];

    if (!selectedKey) {
      throw new Error('Selected API key is undefined');
    }

    

    return selectedKey;
  }

  /**
   * 发送请求到Gemini API
   */
  async sendRequest(
    endpoint: string,
    data: any,
    isStream: boolean = false,
    requestId?: string
  ): Promise<ApiResponse | StreamResponse> {
    const apiKey = this.selectRandomApiKey();
    const url = new URL(endpoint, this.baseUrl);


    // 添加API密钥到查询参数
    url.searchParams.set('key', apiKey);

    // 添加流式参数
    if (isStream) {
      url.searchParams.set('alt', 'sse');
    }

    // 添加请求体大小日志
    const requestBody = JSON.stringify(data);
    const requestSize = new Blob([requestBody]).size;



    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    // 保存Gemini请求数据
    // 移除调试功能以提升性能

    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'gemini-code/2.0.0-workers',
          ...(isStream && { 'Accept': 'text/event-stream' })
        },
        body: requestBody,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const headers = headersToObject(response.headers);

      

      if (response.status >= 400) {
        const errorText = await response.text();

        // Enhanced error logging for API errors
        console.error('[GeminiApiClient] API error response:', {
          status: response.status,
          statusText: response.statusText,
          endpoint,
          url: url.toString(),
          responseText: errorText,
          headers: headersToObject(response.headers),
          timestamp: new Date().toISOString()
        });

        // Try to parse as JSON
        let errorBody;
        try {
          errorBody = JSON.parse(errorText);
        } catch (parseError) {
          console.warn('[GeminiApiClient] Failed to parse error response as JSON:', {
            parseError: parseError instanceof Error ? parseError.message : String(parseError),
            originalText: errorText
          });
          errorBody = { message: errorText };
        }

        // 保存Gemini错误响应数据
        // 移除调试功能以提升性能

        return {
          statusCode: response.status,
          headers,
          body: errorBody,
          isStream: false
        } as ApiResponse;
      }

      if (isStream && response.body) {
        // 保存流式响应的初始数据
        // 移除调试功能以提升性能

        return {
          statusCode: response.status,
          headers,
          stream: response.body
        } as StreamResponse;
      } else {
        const body = await response.json();

        // 保存非流式响应数据
        // 移除调试功能以提升性能

        return {
          statusCode: response.status,
          headers,
          body,
          isStream: false
        } as ApiResponse;
      }
    } catch (error: any) {
      clearTimeout(timeoutId);

      // Enhanced error logging with context
      const errorContext = {
        component: 'GeminiApiClient',
        operation: 'sendRequest',
        endpoint,
        url: url.toString(),
        isStream,
        timeout: this.timeout,
        apiKeyMasked: this.apiKeys[0]?.substring(0, 11) + '***'
      };

      if (error.name === 'AbortError') {
        const timeoutError = new Error(`Request timeout after ${this.timeout}ms`);
        console.error('[GeminiApiClient] Request timeout:', {
          ...errorContext,
          error: timeoutError.message,
          stack: timeoutError.stack,
          timestamp: new Date().toISOString()
        });
        throw timeoutError;
      }

      // Log detailed network error information
      console.error('[GeminiApiClient] Network request failed:', {
        ...errorContext,
        error: {
          message: error.message,
          name: error.name,
          code: error.code,
          cause: error.cause
        },
        stack: error.stack,
        timestamp: new Date().toISOString()
      });

      throw error;
    }
  }

}

/**
 * 创建Gemini客户端的工厂函数
 */
export function createGeminiClient(
  apiKeys: string | string[],
  config: ApiClientConfig = {}
): GeminiApiClient {
  return new GeminiApiClient(apiKeys, config);
}