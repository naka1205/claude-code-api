/**
 * Main request handler - orchestrates the entire request processing flow
 */

import type { ClaudeMessagesRequest, ClaudeCountTokensRequest } from '../types/claude';
import type { Env } from '../types/common';
import { getConfig } from '../config';
import { GeminiClient } from '../client';
import {
  validateMessagesRequest,
  validateCountTokensRequest,
  normalizeMessagesRequest,
} from './request-validator';
import { clientManager } from './client-manager';
import { responseManager } from './response-manager';
import { streamManager } from './stream-manager';
import {
  transformRequestToGemini,
  transformCountTokensRequestToGemini,
} from '../transformers';
import { logger } from '../utils/logger';
import {
  createErrorResponse,
  createSuccessResponse,
  createInternalErrorResponse,
} from '../utils/response';
import { generateRequestId } from '../utils/common';
import {
  requestLogger,
  logClientRequest,
  logGeminiRequest,
  logGeminiResponse,
  logClaudeResponse,
  logError,
} from '../utils/request-logger';
import { getGeminiModel } from '../models';

export class RequestHandler {
  /**
   * Handle /v1/messages request
   */
  async handleMessages(
    request: Request,
    apiKeys: string[],
    env: Env
  ): Promise<Response> {
    const requestId = generateRequestId();
    const startTime = Date.now();
    logger.info('Handling messages request', { requestId });

    try {
      const body: ClaudeMessagesRequest = await request.json();

      requestLogger.createLog(requestId, '/v1/messages', 'POST');
      logClientRequest(requestId, request.headers, body);

      const validation = validateMessagesRequest(body);
      if (!validation.valid) {
        logger.warn('Invalid request', { requestId, error: validation.error });
        logError(requestId, new Error(validation.error!), 'client_request');
        return createErrorResponse('invalid_request_error', validation.error!);
      }

      const claudeRequest = normalizeMessagesRequest(body);

      const config = getConfig(env);
      const client = clientManager.getClient(config, apiKeys);

      const geminiRequest = transformRequestToGemini(claudeRequest);

      const geminiModel = getGeminiModel(claudeRequest.model);
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`;
      logGeminiRequest(requestId, geminiUrl, 'POST', geminiRequest);

      if (claudeRequest.stream) {
        return this.handleStreamingMessages(
          claudeRequest,
          geminiRequest,
          client,
          requestId,
          request.headers
        );
      }

      logger.debug('Processing non-streaming request', { requestId });

      const geminiResponse = await client.generateContent(
        geminiRequest,
        claudeRequest.model
      );

      logGeminiResponse(requestId, 200, 'OK', new Headers(), geminiResponse);

      const claudeResponse = responseManager.processMessagesResponse(
        geminiResponse,
        claudeRequest.model,
        requestId
      );

      logClaudeResponse(requestId, 200, claudeResponse);

      logger.info('Messages request completed', {
        requestId,
        duration: Date.now() - startTime,
        inputTokens: claudeResponse.usage.input_tokens,
        outputTokens: claudeResponse.usage.output_tokens,
        model: claudeRequest.model,
      });

      return createSuccessResponse(claudeResponse);
    } catch (error) {
      logger.error('Messages request failed', error, { requestId });
      logError(requestId, error as Error, 'gemini_response');
      return createInternalErrorResponse((error as Error).message);
    }
  }

  /**
   * Handle streaming messages request
   */
  private async handleStreamingMessages(
    claudeRequest: ClaudeMessagesRequest,
    geminiRequest: any,
    client: GeminiClient,
    requestId: string,
    headers: Headers
  ): Promise<Response> {
    logger.debug('Processing streaming request', { requestId });

    const { response, writer } = streamManager.createStreamResponse();

    (async () => {
      try {
        const geminiStream = client.generateContentStream(
          geminiRequest,
          claudeRequest.model
        );

        const betaHeader = headers.get('anthropic-beta') || '';
        const betaFlags = typeof betaHeader === 'string' ? betaHeader.split(',').map(s => s.trim()) : [];

        await streamManager.streamResponse(
          geminiStream,
          claudeRequest.model,
          writer,
          requestId,
          claudeRequest.thinking,
          betaFlags
        );
      } catch (error) {
        logger.error('Streaming failed', error, { requestId });
      }
    })();

    return response;
  }

  /**
   * Handle /v1/messages/count_tokens request
   */
  async handleCountTokens(
    request: Request,
    apiKeys: string[],
    env: Env
  ): Promise<Response> {
    const requestId = generateRequestId();
    const startTime = Date.now();
    logger.info('Handling count tokens request', { requestId });

    try {
      // Parse request body
      const body: ClaudeCountTokensRequest = await request.json();

      // Validate request
      const validation = validateCountTokensRequest(body);
      if (!validation.valid) {
        logger.warn('Invalid request', { requestId, error: validation.error });
        return createErrorResponse('invalid_request_error', validation.error!);
      }

      // Get configuration and client
      const config = getConfig(env);
      const client = clientManager.getClient(config, apiKeys);

      // Transform request
      const geminiRequest = transformCountTokensRequestToGemini(body);

      // Call Gemini API
      const geminiResponse = await client.countTokens(geminiRequest, body.model);

      // Process response
      const claudeResponse = responseManager.processCountTokensResponse(
        geminiResponse,
        requestId
      );

      logger.info('Count tokens request completed', {
        requestId,
        duration: Date.now() - startTime,
        tokens: claudeResponse.input_tokens,
        model: body.model,
      });

      return createSuccessResponse(claudeResponse);
    } catch (error) {
      logger.error('Count tokens request failed', error, { requestId });
      return createInternalErrorResponse((error as Error).message);
    }
  }

  /**
   * Handle /health request
   */
  handleHealth(): Response {
    return createSuccessResponse({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'claude-to-gemini-api',
    });
  }

  /**
   * Handle /logs request - 获取请求日志列表
   */
  handleLogs(request: Request): Response {
    const url = new URL(request.url);
    const requestId = url.searchParams.get('requestId');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const clear = url.searchParams.get('clear') === 'true';

    try {
      // 如果指定了 clear，清空所有日志
      if (clear) {
        requestLogger.clear();
        return createSuccessResponse({
          message: 'All logs cleared',
          timestamp: new Date().toISOString(),
        });
      }

      // 如果指定了 requestId，返回特定请求的日志
      if (requestId) {
        const log = requestLogger.getLog(requestId);
        if (!log) {
          return createErrorResponse('not_found', `Log not found for requestId: ${requestId}`);
        }
        return createSuccessResponse({ log });
      }

      // 返回所有日志（分页）
      const allLogs = requestLogger.getAllLogs();
      const logs = allLogs.slice(0, limit);
      const stats = requestLogger.getStats();

      return createSuccessResponse({
        logs,
        stats,
        pagination: {
          total: allLogs.length,
          returned: logs.length,
          limit,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to handle logs request', error);
      return createInternalErrorResponse((error as Error).message);
    }
  }

  /**
   * Handle /logs/:requestId request - 获取特定请求的日志详情
   */
  handleLogById(request: Request): Response {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const requestId = pathParts[pathParts.length - 1];

    try {
      if (!requestId) {
        return createErrorResponse('invalid_request_error', 'Missing requestId');
      }

      const log = requestLogger.getLog(requestId);
      if (!log) {
        return createErrorResponse('not_found', `Log not found for requestId: ${requestId}`);
      }

      return createSuccessResponse({ log });
    } catch (error) {
      logger.error('Failed to handle log by id request', error, { requestId });
      return createInternalErrorResponse((error as Error).message);
    }
  }
}

// Singleton instance
export const requestHandler = new RequestHandler();
