/**
 * Gemini API客户端 - Cloudflare Workers版本
 * 使用Fetch API处理对Gemini API的HTTP调用
 */

import { logger } from './middlewares/logger';

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
    this.timeout = config.timeout || 60000;

    if (this.apiKeys.length === 0) {
      throw new Error('At least one API key is required');
    }

    console.log(`[Gemini API] Initialized with ${this.apiKeys.length} API key(s)`);
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

    // 记录使用的API密钥（隐藏敏感信息）
    const maskedKey = selectedKey.length > 8 ? `${selectedKey.substring(0, 8)}***` : '***';
    logger.debug('Using API key', {
      keyIndex: randomIndex + 1,
      totalKeys: this.apiKeys.length,
      maskedKey
    });

    return selectedKey;
  }

  /**
   * 发送请求到Gemini API
   */
  async sendRequest(
    endpoint: string,
    data: any,
    isStream: boolean = false
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

    // Log the full URL (masking API key)
    const logUrl = url.toString().replace(apiKey, apiKey.substring(0, 8) + '***');
    logger.gemini('request', endpoint, {
      url: logUrl,
      isStream,
      requestSize: requestBody.length,
      hasTools: data.tools?.length > 0,
      toolCount: data.tools?.length || 0
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

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

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      // 详细日志响应状态
      logger.gemini('response', endpoint, {
        statusCode: response.status,
        headers,
        isStream
      });

      // Log error responses from Gemini API
      if (response.status >= 400) {
        const errorText = await response.text();
        logger.error('Gemini API error response', {
          statusCode: response.status,
          errorText: logger.truncate(errorText, 500)
        });

        // Log request details that caused the error
        if (data.tools && data.tools.length > 0) {
          logger.error('Error request had tools', {
            tools: data.tools.map((t: any) => {
              if (t.functionDeclarations) return `functions(${t.functionDeclarations.length})`;
              if (t.google_search) return 'google_search';
              if (t.codeExecution) return 'codeExecution';
              return 'unknown';
            })
          });
        }

        // Try to parse as JSON
        let errorBody;
        try {
          errorBody = JSON.parse(errorText);
        } catch {
          errorBody = { message: errorText };
        }

        return {
          statusCode: response.status,
          headers,
          body: errorBody,
          isStream: false
        } as ApiResponse;
      }

      if (isStream && response.body) {
        logger.info('Returning stream response');
        return {
          statusCode: response.status,
          headers,
          stream: response.body
        } as StreamResponse;
      } else {
        logger.debug('Parsing JSON response');
        const body = await response.json();
        logger.debug('Response body received', { bodyKeys: body && typeof body === 'object' ? Object.keys(body) : [] });
        return {
          statusCode: response.status,
          headers,
          body,
          isStream: false
        } as ApiResponse;
      }
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }

      throw error;
    }
  }

  /**
   * 获取当前API密钥数量
   */
  getApiKeyCount(): number {
    return this.apiKeys.length;
  }

  /**
   * 获取配置信息
   */
  getConfig(): {
    keyCount: number;
    baseUrl: string;
    timeout: number;
  } {
    return {
      keyCount: this.apiKeys.length,
      baseUrl: this.baseUrl,
      timeout: this.timeout
    };
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