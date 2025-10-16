/**
 * Gemini API Client with API key rotation support
 */

import type {
  GeminiGenerateContentRequest,
  GeminiGenerateContentResponse,
  GeminiCountTokensRequest,
  GeminiCountTokensResponse,
  GeminiStreamChunk,
} from './types/gemini';
import { getGeminiModel } from './models';
import type { Config } from './config';
import { ApiKeyRotator } from './utils/key-rotator';

export class GeminiClient {
  private config: Config;
  private keyRotator: ApiKeyRotator;

  constructor(config: Config, apiKeys: string[]) {
    this.config = config;
    this.keyRotator = new ApiKeyRotator(apiKeys);
  }

  /**
   * Generate content (non-streaming)
   */
  async generateContent(
    request: GeminiGenerateContentRequest,
    claudeModel: string
  ): Promise<GeminiGenerateContentResponse> {
    try {
      const geminiModel = getGeminiModel(claudeModel);
      const url = this.buildUrl(geminiModel, 'generateContent');
      const apiKey = this.keyRotator.getNextKey();

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let error;
        try {
          error = JSON.parse(errorText);
        } catch (e) {
          error = { message: errorText };
        }
        const errorMessage = `Gemini API error (${response.status}): ${JSON.stringify(error)}`;
        console.error('[GeminiClient] generateContent failed:', errorMessage);
        throw new Error(errorMessage);
      }

      return await response.json();
    } catch (error) {
      console.error('[GeminiClient] generateContent exception:', error);
      throw error;
    }
  }

  /**
   * Generate content (streaming)
   */
  async *generateContentStream(
    request: GeminiGenerateContentRequest,
    claudeModel: string
  ): AsyncGenerator<GeminiStreamChunk> {
    try {
      const geminiModel = getGeminiModel(claudeModel);
      const url = this.buildUrl(geminiModel, 'streamGenerateContent', { alt: 'sse' });
      const apiKey = this.keyRotator.getNextKey();

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let error;
        try {
          error = JSON.parse(errorText);
        } catch (e) {
          error = { message: errorText };
        }
        const errorMessage = `Gemini API error (${response.status}): ${JSON.stringify(error)}`;
        console.error('[GeminiClient] generateContentStream failed:', errorMessage);
        throw new Error(errorMessage);
      }

      if (!response.body) {
        const errorMessage = 'No response body from Gemini API';
        console.error('[GeminiClient] generateContentStream failed:', errorMessage);
        throw new Error(errorMessage);
      }

      // Parse SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data.trim()) {
              try {
                const chunk = JSON.parse(data);
                yield chunk;
              } catch (e) {
                console.error('[GeminiClient] Failed to parse SSE data:', { data, error: e });
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('[GeminiClient] generateContentStream exception:', error);
      throw error;
    }
  }

  /**
   * Count tokens
   */
  async countTokens(
    request: GeminiCountTokensRequest,
    claudeModel: string
  ): Promise<GeminiCountTokensResponse> {
    try {
      const geminiModel = getGeminiModel(claudeModel);
      const url = this.buildUrl(geminiModel, 'countTokens');
      const apiKey = this.keyRotator.getNextKey();

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let error;
        try {
          error = JSON.parse(errorText);
        } catch (e) {
          error = { message: errorText };
        }
        const errorMessage = `Gemini API error (${response.status}): ${JSON.stringify(error)}`;
        console.error('[GeminiClient] countTokens failed:', errorMessage);
        throw new Error(errorMessage);
      }

      return await response.json();
    } catch (error) {
      console.error('[GeminiClient] countTokens exception:', error);
      throw error;
    }
  }

  /**
   * Build Gemini API URL
   */
  private buildUrl(
    model: string,
    method: string,
    params?: Record<string, string>
  ): string {
    const base = `${this.config.geminiBaseUrl}/${this.config.geminiApiVersion}/models/${model}:${method}`;

    if (params) {
      const queryString = new URLSearchParams(params).toString();
      return `${base}?${queryString}`;
    }

    return base;
  }
}
