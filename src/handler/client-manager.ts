/**
 * 客户端管理器 - Cloudflare Workers版本
 * 管理Gemini API客户端实例
 */

import { GeminiApiClient } from '../client';
import { loadConfig, Config } from '../config';

export class ClientManager {
  private config: any;
  private cachedAppConfig: Config | null = null;

  constructor(config: any) {
    this.config = config;
    // 在构造函数中缓存配置
    this.cachedAppConfig = loadConfig(this.config.env);
  }

  /**
   * 创建Gemini客户端
   */
  createClient(apiKeys: string[]): GeminiApiClient {
    const appConfig = this.getAppConfig();

    return new GeminiApiClient(apiKeys, {
      baseUrl: appConfig.gemini.baseUrl,
      timeout: appConfig.gemini.timeout
    });
  }

  /**
   * 获取客户端配置
   */
  getClientConfig(): any {
    const appConfig = this.getAppConfig();
    return {
      baseUrl: appConfig.gemini.baseUrl,
      timeout: appConfig.gemini.timeout,
      apiVersion: appConfig.gemini.apiVersion
    };
  }

  /**
   * 获取超时配置
   */
  getTimeout(): number {
    const appConfig = this.getAppConfig();
    return appConfig.gemini.timeout;
  }

  /**
   * 获取缓存的应用配置
   */
  private getAppConfig(): Config {
    if (!this.cachedAppConfig) {
      this.cachedAppConfig = loadConfig(this.config.env);
    }
    return this.cachedAppConfig;
  }
}