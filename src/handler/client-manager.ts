/**
 * 客户端管理器 - Cloudflare Workers版本
 * 管理Gemini API客户端实例
 */

import { GeminiApiClient, createGeminiClient } from '../client';
import { loadConfig } from '../config';

export class ClientManager {
  private config: any;

  constructor(config: any) {
    this.config = config;
  }

  /**
   * 创建Gemini客户端
   */
  createClient(apiKeys: string[]): GeminiApiClient {
    const appConfig = loadConfig(this.config.env);

    return createGeminiClient(apiKeys, {
      baseUrl: appConfig.gemini.baseUrl,
      timeout: appConfig.gemini.timeout
    });
  }

  /**
   * 获取客户端配置
   */
  getClientConfig(): any {
    const appConfig = loadConfig(this.config.env);
    return {
      baseUrl: appConfig.gemini.baseUrl,
      timeout: appConfig.gemini.timeout,
      apiVersion: appConfig.gemini.apiVersion
    };
  }
}