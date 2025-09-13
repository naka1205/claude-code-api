/**
 * Cloudflare Workers 速率限制器
 * 使用 KV 存储实现分布式速率限制
 */

export interface RateLimitConfig {
  maxRequests: number;  // 最大请求数
  windowMs: number;     // 时间窗口（毫秒）
  keyPrefix?: string;   // KV 键前缀
}

export class RateLimiter {
  private kv: KVNamespace;
  private config: RateLimitConfig;

  constructor(kv: KVNamespace, config: RateLimitConfig) {
    this.kv = kv;
    this.config = {
      keyPrefix: 'ratelimit_',
      ...config
    };
  }

  /**
   * 生成速率限制键
   */
  private getRateLimitKey(identifier: string): string {
    const window = Math.floor(Date.now() / this.config.windowMs);
    return `${this.config.keyPrefix}${identifier}_${window}`;
  }

  /**
   * 检查并更新速率限制
   */
  async checkRateLimit(identifier: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: number;
  }> {
    const key = this.getRateLimitKey(identifier);
    const resetAt = Math.ceil(Date.now() / this.config.windowMs) * this.config.windowMs;

    try {
      // 获取当前计数
      const currentCount = await this.kv.get(key, 'json') as number | null;
      const count = currentCount || 0;

      if (count >= this.config.maxRequests) {
        return {
          allowed: false,
          remaining: 0,
          resetAt
        };
      }

      // 增加计数
      const newCount = count + 1;
      const ttl = Math.ceil(this.config.windowMs / 1000);

      await this.kv.put(key, JSON.stringify(newCount), {
        expirationTtl: ttl
      });

      return {
        allowed: true,
        remaining: this.config.maxRequests - newCount,
        resetAt
      };
    } catch (error) {
      console.error('Rate limit check error:', error);
      // 失败时允许请求通过
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetAt
      };
    }
  }

  /**
   * 获取客户端标识符
   */
  static getClientIdentifier(request: Request): string {
    // 优先使用 API 密钥
    const apiKey = request.headers.get('x-api-key');
    if (apiKey) {
      // 对 API 密钥进行哈希处理
      return this.hashString(apiKey);
    }

    // 使用 IP 地址（Cloudflare 提供）
    const ip = request.headers.get('CF-Connecting-IP') ||
               request.headers.get('X-Forwarded-For') ||
               'unknown';

    return this.hashString(ip);
  }

  /**
   * 简单哈希函数
   */
  private static hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 创建速率限制响应
   */
  static createRateLimitResponse(
    remaining: number,
    resetAt: number,
    headers: HeadersInit = {}
  ): Response {
    return new Response(JSON.stringify({
      error: 'Rate limit exceeded',
      message: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil((resetAt - Date.now()) / 1000)
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': new Date(resetAt).toISOString(),
        'Retry-After': Math.ceil((resetAt - Date.now()) / 1000).toString(),
        ...headers
      }
    });
  }

  /**
   * 添加速率限制头到响应
   */
  static addRateLimitHeaders(
    response: Response,
    remaining: number,
    resetAt: number,
    limit: number
  ): Response {
    const newHeaders = new Headers(response.headers);
    newHeaders.set('X-RateLimit-Limit', limit.toString());
    newHeaders.set('X-RateLimit-Remaining', remaining.toString());
    newHeaders.set('X-RateLimit-Reset', new Date(resetAt).toISOString());

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  }
}

/**
 * 分层速率限制配置
 */
export class TieredRateLimiter {
  private limiters: Map<string, RateLimiter>;

  constructor(kv: KVNamespace) {
    this.limiters = new Map();

    // 默认层级
    this.limiters.set('burst', new RateLimiter(kv, {
      maxRequests: 30,  // 增加到30个请求
      windowMs: 60000, // 1分钟30个请求
      keyPrefix: 'rl_burst_'
    }));

    this.limiters.set('sustained', new RateLimiter(kv, {
      maxRequests: 200,  // 增加到200个请求
      windowMs: 3600000, // 1小时200个请求
      keyPrefix: 'rl_sustained_'
    }));

    this.limiters.set('daily', new RateLimiter(kv, {
      maxRequests: 2000,  // 增加到2000个请求
      windowMs: 86400000, // 1天2000个请求
      keyPrefix: 'rl_daily_'
    }));
  }

  /**
   * 检查所有层级的速率限制
   */
  async checkAllLimits(identifier: string): Promise<{
    allowed: boolean;
    limitType?: string;
    remaining: number;
    resetAt: number;
  }> {
    for (const [type, limiter] of this.limiters) {
      const result = await limiter.checkRateLimit(identifier);

      if (!result.allowed) {
        return {
          allowed: false,
          limitType: type,
          remaining: result.remaining,
          resetAt: result.resetAt
        };
      }
    }

    // 所有限制都通过，返回最严格的限制信息
    const burstLimit = await this.limiters.get('burst')!.checkRateLimit(identifier);
    return {
      allowed: true,
      remaining: burstLimit.remaining,
      resetAt: burstLimit.resetAt
    };
  }

  /**
   * 为特定用户设置自定义限制
   */
  addCustomLimit(tier: string, config: RateLimitConfig, kv: KVNamespace): void {
    this.limiters.set(tier, new RateLimiter(kv, config));
  }
}