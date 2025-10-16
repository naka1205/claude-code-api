/**
 * API Key Rotation Manager - 随机获取策略避免速率限制
 *
 * 使用说明：
 * 客户端通过请求头提交逗号分隔的多个 API 密钥：
 * x-api-key: key1,key2,key3
 *
 * 服务端使用随机策略分配密钥，避免触发单个密钥的速率限制
 */

export class ApiKeyRotator {
  private keys: string[];

  constructor(keys: string[]) {
    if (!keys || keys.length === 0) {
      throw new Error('At least one API key is required');
    }
    this.keys = keys;
  }

  /**
   * 随机获取一个 API 密钥
   * 每次调用随机返回一个密钥，实现负载均衡
   */
  getNextKey(): string {
    const randomIndex = Math.floor(Math.random() * this.keys.length);
    return this.keys[randomIndex];
  }

  /**
   * 获取密钥总数
   */
  getKeyCount(): number {
    return this.keys.length;
  }

  /**
   * 获取所有密钥（用于调试）
   */
  getAllKeys(): string[] {
    return [...this.keys];
  }
}
