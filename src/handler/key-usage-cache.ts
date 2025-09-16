/**
 * API密钥缓存管理器 - Cloudflare Workers版本
 * 使用Workers KV存储实现密钥使用情况缓存
 */

export interface KeyUsageInfo {
  key: string;
  lastUsed: number;
  usageCount: number;
  errorCount: number;
  lastError?: number;
  lastErrorCode?: number;
}

export class KeyUsageCache {
  private static CACHE_KEY_PREFIX = 'api_key_usage:';
  private static ERROR_COOLDOWN = 60000; // 1分钟错误冷却时间
  private static RATE_LIMIT_COOLDOWN = 300000; // 5分钟速率限制冷却时间
  private static OVERLOAD_COOLDOWN = 30000; // 30秒过载冷却时间（503错误）

  /**
   * 选择最佳API密钥
   */
  static async pickBestKey(
    apiKeys: string[],
    model: string,
    kv?: KVNamespace
  ): Promise<string | null> {
    if (!apiKeys || apiKeys.length === 0) {
      return null;
    }

    // 如果没有KV存储，使用简单的轮询
    if (!kv) {
      return apiKeys[Math.floor(Math.random() * apiKeys.length)];
    }

    // 获取所有密钥的使用情况
    const keyUsagePromises = apiKeys.map(key =>
      this.getKeyUsage(key, kv)
    );
    const keyUsages = await Promise.all(keyUsagePromises);

    // 过滤出可用的密钥
    const now = Date.now();
    const availableKeys = keyUsages.filter(usage => {
      // 检查错误冷却
      if (usage.lastError) {
        let cooldownTime: number;

        switch (usage.lastErrorCode) {
          case 429:
            cooldownTime = this.RATE_LIMIT_COOLDOWN;
            break;
          case 503:
            cooldownTime = this.OVERLOAD_COOLDOWN;
            break;
          default:
            cooldownTime = this.ERROR_COOLDOWN;
        }

        if (now - usage.lastError < cooldownTime) {
          return false;
        }
      }
      return true;
    });

    if (availableKeys.length === 0) {
      // 如果没有立即可用的密钥，选择错误最少的
      const sortedByErrors = keyUsages.sort((a, b) =>
        a.errorCount - b.errorCount
      );
      return sortedByErrors[0]?.key || null;
    }

    // 选择使用次数最少的密钥
    const sortedByUsage = availableKeys.sort((a, b) =>
      a.usageCount - b.usageCount
    );

    return sortedByUsage[0]?.key || null;
  }

  /**
   * 记录密钥使用
   */
  static async reserve(key: string, kv?: KVNamespace): Promise<void> {
    if (!kv) return;

    const usage = await this.getKeyUsage(key, kv);
    usage.lastUsed = Date.now();
    usage.usageCount++;

    await kv.put(
      this.CACHE_KEY_PREFIX + key,
      JSON.stringify(usage),
      { expirationTtl: 86400 } // 24小时过期
    );
  }

  /**
   * 记录密钥错误
   */
  static async onError(
    key: string,
    errorCode: number,
    kv?: KVNamespace
  ): Promise<void> {
    if (!kv) return;

    const usage = await this.getKeyUsage(key, kv);
    usage.lastError = Date.now();
    usage.lastErrorCode = errorCode;
    usage.errorCount++;

    // 503错误记录但不严重影响后续选择，因为这通常是临时性问题
    if (errorCode === 503) {
      
    }

    await kv.put(
      this.CACHE_KEY_PREFIX + key,
      JSON.stringify(usage),
      { expirationTtl: 86400 }
    );
  }

  /**
   * 记录密钥成功使用
   */
  static async onSuccess(key: string, kv?: KVNamespace): Promise<void> {
    if (!kv) return;

    const usage = await this.getKeyUsage(key, kv);
    // 成功使用时重置错误计数
    if (usage.errorCount > 0) {
      usage.errorCount = Math.max(0, usage.errorCount - 1);
    }
    delete usage.lastError;
    delete usage.lastErrorCode;

    await kv.put(
      this.CACHE_KEY_PREFIX + key,
      JSON.stringify(usage),
      { expirationTtl: 86400 }
    );
  }

  /**
   * 获取密钥使用情况
   */
  private static async getKeyUsage(
    key: string,
    kv: KVNamespace
  ): Promise<KeyUsageInfo> {
    const cached = await kv.get(this.CACHE_KEY_PREFIX + key);

    if (cached) {
      return JSON.parse(cached);
    }

    return {
      key,
      lastUsed: 0,
      usageCount: 0,
      errorCount: 0
    };
  }

  /**
   * 清理过期的缓存数据
   */
  static async cleanup(kv?: KVNamespace): Promise<void> {
    if (!kv) return;

    // Workers KV会自动处理过期，这里可以添加额外的清理逻辑
    // 例如：删除超过30天未使用的密钥记录
  }

  /**
   * 获取所有密钥的统计信息
   */
  static async getStats(
    apiKeys: string[],
    kv?: KVNamespace
  ): Promise<Record<string, KeyUsageInfo>> {
    if (!kv) {
      return {};
    }

    const stats: Record<string, KeyUsageInfo> = {};

    for (const key of apiKeys) {
      stats[key] = await this.getKeyUsage(key, kv);
    }

    return stats;
  }
}