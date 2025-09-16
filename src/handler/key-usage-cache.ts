/**
 * API密钥缓存管理器 - 简化版本（无KV依赖）
 * 使用内存缓存和简单轮询策略
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
  private static ERROR_COOLDOWN = 60000; // 1分钟错误冷却时间
  private static RATE_LIMIT_COOLDOWN = 300000; // 5分钟速率限制冷却时间
  private static OVERLOAD_COOLDOWN = 30000; // 30秒过载冷却时间（503错误）

  // 内存缓存
  private static memoryCache = new Map<string, KeyUsageInfo>();

  /**
   * 选择最佳API密钥
   */
  static async pickBestKey(
    apiKeys: string[],
    model: string
  ): Promise<string | null> {
    if (!apiKeys || apiKeys.length === 0) {
      return null;
    }

    // 获取所有密钥的使用情况
    const keyUsages = apiKeys.map(key => this.getKeyUsageFromMemory(key));

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
  static async reserve(key: string): Promise<void> {
    const usage = this.getKeyUsageFromMemory(key);
    usage.lastUsed = Date.now();
    usage.usageCount++;
    this.memoryCache.set(key, usage);
  }

  /**
   * 记录密钥错误
   */
  static async onError(
    key: string,
    errorCode: number
  ): Promise<void> {
    const usage = this.getKeyUsageFromMemory(key);
    usage.lastError = Date.now();
    usage.lastErrorCode = errorCode;
    usage.errorCount++;
    this.memoryCache.set(key, usage);
  }

  /**
   * 记录密钥成功使用
   */
  static async onSuccess(key: string): Promise<void> {
    const usage = this.getKeyUsageFromMemory(key);
    // 成功使用时重置错误计数
    if (usage.errorCount > 0) {
      usage.errorCount = Math.max(0, usage.errorCount - 1);
    }
    delete usage.lastError;
    delete usage.lastErrorCode;
    this.memoryCache.set(key, usage);
  }

  /**
   * 获取密钥使用情况（从内存）
   */
  private static getKeyUsageFromMemory(key: string): KeyUsageInfo {
    const cached = this.memoryCache.get(key);

    if (cached) {
      return cached;
    }

    const newUsage: KeyUsageInfo = {
      key,
      lastUsed: 0,
      usageCount: 0,
      errorCount: 0
    };

    this.memoryCache.set(key, newUsage);
    return newUsage;
  }

  /**
   * 清理过期的缓存数据
   */
  static async cleanup(): Promise<void> {
    const now = Date.now();
    const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;

    // 清理超过30天未使用的记录
    for (const [key, usage] of this.memoryCache.entries()) {
      if (usage.lastUsed && (now - usage.lastUsed) > thirtyDaysInMs) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * 获取所有密钥的统计信息
   */
  static async getStats(
    apiKeys: string[]
  ): Promise<Record<string, KeyUsageInfo>> {
    const stats: Record<string, KeyUsageInfo> = {};

    for (const key of apiKeys) {
      stats[key] = this.getKeyUsageFromMemory(key);
    }

    return stats;
  }
}