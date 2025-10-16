/**
 * 请求验证器 - Cloudflare Workers版本
 * 验证Claude API请求格式
 */

import { ClaudeRequest, ClaudeCountRequest } from '../types/claude';

export class RequestValidator {
  /**
   * 验证Claude消息请求
   */
  validateClaudeRequest(body: any): string | null {
    if (!body) {
      return 'Request body is required';
    }

    // 验证必需字段
    if (!body.model) {
      return 'model field is required';
    }

    if (!body.messages || !Array.isArray(body.messages)) {
      return 'messages field must be an array';
    }

    if (body.messages.length === 0) {
      return 'messages array cannot be empty';
    }

    if (typeof body.max_tokens !== 'number' || body.max_tokens <= 0) {
      return 'max_tokens must be a positive number';
    }

    // 验证消息格式
    for (let i = 0; i < body.messages.length; i++) {
      const message = body.messages[i];
      if (!message.role || !['user', 'assistant'].includes(message.role)) {
        return `Invalid role in message ${i}: ${message.role}`;
      }

      if (!message.content) {
        return `Content is required in message ${i}`;
      }
    }

    // 验证可选参数
    if (body.temperature !== undefined) {
      if (typeof body.temperature !== 'number' || body.temperature < 0 || body.temperature > 1) {
        return 'temperature must be between 0 and 1';
      }
    }

    if (body.top_p !== undefined) {
      if (typeof body.top_p !== 'number' || body.top_p < 0 || body.top_p > 1) {
        return 'top_p must be between 0 and 1';
      }
    }

    if (body.top_k !== undefined) {
      if (typeof body.top_k !== 'number' || body.top_k < 1) {
        return 'top_k must be at least 1';
      }
    }

    return null;
  }

  /**
   * 验证计数请求
   */
  validateCountRequest(body: any): string | null {
    if (!body) {
      return 'Request body is required';
    }

    if (!body.model) {
      return 'model field is required';
    }

    if (!body.messages || !Array.isArray(body.messages)) {
      return 'messages field must be an array';
    }

    if (body.messages.length === 0) {
      return 'messages array cannot be empty';
    }

    return null;
  }

  /**
   * 验证工具定义
   */
  validateTools(tools: any[]): string | null {
    if (!Array.isArray(tools)) {
      return 'tools must be an array';
    }

    for (let i = 0; i < tools.length; i++) {
      const tool = tools[i];
      if (!tool.name) {
        return `Tool ${i} must have a name`;
      }

      if (tool.input_schema && typeof tool.input_schema !== 'object') {
        return `Tool ${i} input_schema must be an object`;
      }
    }

    return null;
  }
}