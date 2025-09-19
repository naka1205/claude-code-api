/**
 * API密钥管理器 - Cloudflare Workers版本
 * 处理API密钥的提取和管理
 */

import { API_KEY } from '../utils/constants';

export class ApiKeyManager {
  /**
   * 从请求头中提取API密钥
   */
  extractApiKeys(headers: Record<string, string>): string[] {
    const keys: string[] = [];

    // 从Authorization头提取
    const authHeader = headers[API_KEY.ALT_HEADER_NAME] || headers['Authorization'];
    if (authHeader) {
      if (authHeader.startsWith('Bearer ')) {
        const keyString = authHeader.substring(7).trim();
        if (keyString) {
          // 检查是否包含多个密钥（用逗号分隔）
          if (keyString.includes(',')) {
            const multiKeys = keyString.split(',').map(k => k.trim()).filter(k => k);
            keys.push(...multiKeys);
          } else {
            keys.push(keyString);
          }
        }
      }
    }

    // 从x-api-key头提取
    const apiKeyHeader = headers[API_KEY.HEADER_NAME] || headers['X-API-Key'] || headers['X-Api-Key'];
    if (apiKeyHeader) {
      // 支持多个密钥，用逗号分隔
      const multiKeys = apiKeyHeader.split(',').map(k => k.trim()).filter(k => k);
      keys.push(...multiKeys);
    }

    // 去重
    return [...new Set(keys)];
  }

  /**
   * 验证API密钥格式
   */
  validateApiKey(key: string): boolean {
    // Gemini API密钥通常以 "AIza" 开头
    // 这里只做基本长度检查
    return key.length >= API_KEY.MIN_LENGTH;
  }
}