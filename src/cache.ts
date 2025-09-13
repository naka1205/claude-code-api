/**
 * Cloudflare Workers 缓存管理器
 * 利用 KV 存储和 Cache API 优化性能
 */

import { ClaudeRequest, ClaudeResponse } from './types/claude';
import { GeminiRequest, GeminiResponse } from './types/gemini';

export interface CacheConfig {
  ttl?: number; // 缓存过期时间（秒）
  cacheControl?: string; // Cache-Control 头
}

export class CacheManager {
  private kv?: KVNamespace;

  constructor(kv?: KVNamespace) {
    this.kv = kv;
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(request: ClaudeRequest): string {
    // 使用请求的关键字段生成唯一键
    const keyData = {
      model: request.model,
      messages: request.messages,
      max_tokens: request.max_tokens,
      temperature: request.temperature,
      tools: request.tools?.map(t => t.name).sort(),
      system: typeof request.system === 'string' ? request.system : ''
    };

    // 生成哈希
    return this.hashObject(keyData);
  }

  /**
   * 简单哈希函数
   */
  private hashObject(obj: any): string {
    const str = JSON.stringify(obj);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `cache_${Math.abs(hash).toString(36)}`;
  }

  /**
   * 从 KV 存储获取缓存
   */
  async getFromKV(key: string): Promise<ClaudeResponse | null> {
    if (!this.kv) return null;

    try {
      const cached = await this.kv.get(key, 'json');
      if (cached) {
        return cached as ClaudeResponse;
      }
    } catch (error) {
      console.error('KV get error:', error);
    }

    return null;
  }

  /**
   * 保存到 KV 存储
   */
  async saveToKV(key: string, response: ClaudeResponse, ttl: number = 3600): Promise<void> {
    if (!this.kv) return;

    try {
      await this.kv.put(key, JSON.stringify(response), {
        expirationTtl: ttl
      });
    } catch (error) {
      console.error('KV put error:', error);
    }
  }

  /**
   * 检查请求是否可缓存
   */
  isRequestCacheable(request: ClaudeRequest): boolean {
    // 流式请求不缓存
    if (request.stream) return false;

    // 有工具调用的请求不缓存（因为可能有副作用）
    if (request.tools && request.tools.length > 0) return false;

    // 温度为0的请求更适合缓存（确定性输出）
    if (request.temperature === 0) return true;

    // 低温度的请求也可以缓存
    return (request.temperature || 1) < 0.3;
  }

  /**
   * 获取缓存的响应
   */
  async getCachedClaudeResponse(request: ClaudeRequest): Promise<ClaudeResponse | null> {
    if (!this.isRequestCacheable(request)) {
      return null;
    }

    const cacheKey = this.generateCacheKey(request);
    return await this.getFromKV(cacheKey);
  }

  /**
   * 缓存 Claude 响应
   */
  async cacheClaudeResponse(
    request: ClaudeRequest,
    response: ClaudeResponse,
    ttl?: number
  ): Promise<void> {
    if (!this.isRequestCacheable(request)) {
      return;
    }

    const cacheKey = this.generateCacheKey(request);

    // 根据温度决定 TTL
    const cacheTtl = ttl || this.calculateTTL(request);

    await this.saveToKV(cacheKey, response, cacheTtl);
  }

  /**
   * 计算缓存 TTL
   */
  private calculateTTL(request: ClaudeRequest): number {
    const temp = request.temperature || 1;

    // 温度为0：缓存24小时
    if (temp === 0) return 86400;

    // 低温度：缓存1小时
    if (temp < 0.3) return 3600;

    // 中等温度：缓存10分钟
    if (temp < 0.7) return 600;

    // 高温度：不缓存或短时间缓存
    return 60;
  }

  /**
   * 清理过期缓存（可选）
   */
  async cleanup(prefix: string = 'cache_'): Promise<void> {
    if (!this.kv) return;

    try {
      // KV 会自动处理过期，这里可以实现自定义清理逻辑
      const list = await this.kv.list({ prefix });

      // 批量删除过期的键（如果需要）
      const keysToDelete: string[] = [];

      for (const key of list.keys) {
        // 可以添加自定义的过期检查逻辑
        // 例如检查元数据中的时间戳
      }

      if (keysToDelete.length > 0) {
        // Cloudflare KV 暂不支持批量删除，需要逐个删除
        await Promise.all(keysToDelete.map(key => this.kv!.delete(key)));
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  /**
   * 创建带缓存控制的响应
   */
  createCachedResponse(
    body: string,
    status: number = 200,
    headers: HeadersInit = {},
    cacheControl: string = 'public, max-age=3600'
  ): Response {
    return new Response(body, {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': cacheControl,
        ...headers
      }
    });
  }

  /**
   * 获取缓存统计信息
   */
  async getStats(prefix: string = 'cache_'): Promise<{
    totalKeys: number;
    estimatedSize: number;
  }> {
    if (!this.kv) {
      return { totalKeys: 0, estimatedSize: 0 };
    }

    try {
      const list = await this.kv.list({ prefix });
      return {
        totalKeys: list.keys.length,
        estimatedSize: list.keys.length * 1024 // 估算值
      };
    } catch (error) {
      console.error('Stats error:', error);
      return { totalKeys: 0, estimatedSize: 0 };
    }
  }
}