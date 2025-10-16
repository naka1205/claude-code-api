/**
 * Gemini API client manager with connection pooling
 */

import { GeminiClient } from '../client';
import type { Config } from '../config';
import { logger } from '../utils/logger';

export class ClientManager {
  private clients: Map<string, GeminiClient> = new Map();

  /**
   * Get or create client for given API keys
   */
  getClient(config: Config, apiKeys: string[]): GeminiClient {
    // Create a cache key from sorted API keys
    const cacheKey = apiKeys.sort().join(',');

    if (this.clients.has(cacheKey)) {
      logger.debug('Reusing existing Gemini client', { keyCount: apiKeys.length });
      return this.clients.get(cacheKey)!;
    }

    logger.info('Creating new Gemini client', { keyCount: apiKeys.length });
    const client = new GeminiClient(config, apiKeys);
    this.clients.set(cacheKey, client);

    return client;
  }

  /**
   * Clear all clients (for testing/cleanup)
   */
  clearClients(): void {
    this.clients.clear();
    logger.debug('Cleared all Gemini clients');
  }

  /**
   * Get client count
   */
  getClientCount(): number {
    return this.clients.size;
  }
}

// Singleton instance
export const clientManager = new ClientManager();
