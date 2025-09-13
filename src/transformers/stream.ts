/**
 * 流式转换器 V2
 * 负责处理流式数据的转换和格式化
 */

import { ClaudeContentBlock, ClaudeStreamEvent } from '../types/claude';
import { GeminiPart } from '../types/gemini';

export interface StreamBuffer {
  textContent: string;
  functionCalls: Array<{ name: string; args: any; id: string }>;
  functionResponses: Array<{ name: string; response: any; callId: string }>;
  thinkingContent: string;
}

export class StreamTransformer {
  private messageId: string;
  private model: string;
  private buffer: StreamBuffer;
  private processedFunctionCalls: Map<string, string>; // 函数签名 -> toolUseId
  private processedTextHashes: Set<string>;
  private lastTextContent: string;

  constructor(messageId: string, model: string) {
    this.messageId = messageId;
    this.model = model;
    this.buffer = {
      textContent: '',
      functionCalls: [],
      functionResponses: [],
      thinkingContent: ''
    };
    this.processedFunctionCalls = new Map();
    this.processedTextHashes = new Set();
    this.lastTextContent = '';
  }

  /**
   * 静态方法：直接转换单个流块（用于 Workers）
   */
  static transformChunk(geminiChunk: any, model: string = 'claude-3-5-sonnet-20241022'): ClaudeStreamEvent {
    try {
      // 检查是否有候选内容
      if (!geminiChunk.candidates || geminiChunk.candidates.length === 0) {
        return {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: '' }
        };
      }

      const candidate = geminiChunk.candidates[0];
      if (!candidate.content || !candidate.content.parts) {
        return {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: '' }
        };
      }

      // 处理内容部分
      const parts = candidate.content.parts;
      const events: ClaudeStreamEvent[] = [];

      for (const part of parts) {
        if (part.text !== undefined) {
          return {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: part.text }
          };
        } else if (part.functionCall) {
          return {
            type: 'content_block_start',
            index: 0,
            content_block: {
              type: 'tool_use',
              id: `toolu_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
              name: part.functionCall.name,
              input: part.functionCall.args || {}
            }
          };
        }
      }

      // 默认返回空文本增量
      return {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: '' }
      };
    } catch (error) {
      console.error('Error transforming chunk:', error);
      return {
        type: 'error',
        error: {
          type: 'api_error',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  /**
   * 处理流式数据块
   */
  processStreamChunk(parts: GeminiPart[], exposeThinkingToClient: boolean = false): ClaudeContentBlock[] {
    const blocks: ClaudeContentBlock[] = [];

    for (const part of parts) {
      // thoughtSignature 是加密的上下文令牌，不应该显示
      // 它应该被保存用于多轮对话的上下文维持
      if (part.thoughtSignature) {
        // TODO: 保存thoughtSignature用于后续请求
        // 暂时跳过，不作为思考内容显示
      }

      // 处理text内容
      if (part.text !== undefined) {
        // 检查是否是思考内容（通过thought标记）
        const isThinkingContent = part.thought === true;

        if (isThinkingContent) {
          // 这是思考内容，只有在exposeThinkingToClient为true时才处理
          if (exposeThinkingToClient) {
            const thinkingBlock = this.processThinkingPart(part.text);
            if (thinkingBlock) {
              blocks.push(thinkingBlock);
            }
          }
        } else {
          // 普通文本内容
          const textBlock = this.processTextPartWithDedup(part.text);
          if (textBlock) {
            blocks.push(textBlock);
          }
        }
      } else if (part.functionCall) {
        // 处理函数调用 - 使用内容签名去重
        const toolUseBlock = this.processFunctionCallWithDedup(part.functionCall);
        if (toolUseBlock) {
          blocks.push(toolUseBlock);
        }
      } else if (part.functionResponse) {
        // 函数响应通常在非流式模式中处理
        const toolResultBlock = this.processFunctionResponse(part.functionResponse);
        if (toolResultBlock) {
          blocks.push(toolResultBlock);
        }
      }
    }

    return blocks;
  }

  /**
   * 处理文本部分 - 支持去重
   */
  private processTextPartWithDedup(text: string): ClaudeContentBlock | null {
    if (!text) return null;

    // 检查是否为累积文本（包含之前的内容）
    if (this.lastTextContent && text.startsWith(this.lastTextContent)) {
      // 提取增量部分
      const incrementalText = text.substring(this.lastTextContent.length);
      if (!incrementalText) return null;

      this.lastTextContent = text;
      this.buffer.textContent += incrementalText;

      return {
        type: 'text',
        text: incrementalText
      };
    }

    // 新的文本内容或真正的增量文本
    this.lastTextContent = text;
    this.buffer.textContent += text;

    return {
      type: 'text',
      text: text
    };
  }

  /**
   * 处理thinking部分
   */
  private processThinkingPart(thinkingText: string): ClaudeContentBlock | null {
    if (!thinkingText) return null;

    this.buffer.thinkingContent += thinkingText;

    return {
      type: 'thinking',
      thinking: thinkingText,
      signature: this.generateThinkingSignature(thinkingText)
    };
  }

  /**
   * 处理函数调用 - 支持去重
   */
  private processFunctionCallWithDedup(functionCall: { name: string; args: any }): ClaudeContentBlock | null {
    if (!functionCall.name) return null;

    // 生成函数调用的唯一签名
    const signature = this.generateFunctionSignature(functionCall);

    // 检查是否已处理过相同的函数调用
    if (this.processedFunctionCalls.has(signature)) {
      // 返回null避免重复处理
      return null;
    }

    const toolUseId = this.generateToolUseId();

    // 记录已处理的函数调用
    this.processedFunctionCalls.set(signature, toolUseId);

    // 记录到缓冲区
    this.buffer.functionCalls.push({
      name: functionCall.name,
      args: functionCall.args || {},
      id: toolUseId
    });

    return {
      type: 'tool_use',
      id: toolUseId,
      name: functionCall.name,
      input: functionCall.args || {}
    };
  }

  /**
   * 处理函数响应
   */
  private processFunctionResponse(functionResponse: { name: string; response: any }): ClaudeContentBlock | null {
    if (!functionResponse.name) return null;

    // 尝试匹配之前的函数调用
    const matchingCall = this.buffer.functionCalls.find(call => call.name === functionResponse.name);
    const toolUseId = matchingCall?.id || this.generateToolUseId();

    // 记录到缓冲区
    this.buffer.functionResponses.push({
      name: functionResponse.name,
      response: functionResponse.response,
      callId: toolUseId
    });

    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: functionResponse.response,
      is_error: !!(functionResponse.response as any)?.is_error
    };
  }

  /**
   * 生成函数调用的唯一签名
   */
  private generateFunctionSignature(functionCall: { name: string; args: any }): string {
    // 使用函数名和参数的JSON字符串生成唯一签名
    const argsStr = JSON.stringify(functionCall.args || {});
    const content = `${functionCall.name}:${argsStr}`;
    return this.simpleHash(content);
  }

  /**
   * 生成工具使用ID
   */
  private generateToolUseId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `toolu_${timestamp}_${random}`;
  }

  /**
   * 生成thinking签名
   */
  private generateThinkingSignature(thinkingContent: string): string {
    const timestamp = Date.now().toString(36);
    const hash = this.simpleHash(thinkingContent);
    return `sig_${hash}_${timestamp}_stream`;
  }

  /**
   * 简单哈希函数
   */
  private simpleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36).substring(0, 8);
  }

  /**
   * 获取当前缓冲区状态
   */
  getBufferState(): StreamBuffer & {
    totalTextLength: number;
    functionCallCount: number;
    functionResponseCount: number;
    thinkingLength: number;
  } {
    return {
      ...this.buffer,
      totalTextLength: this.buffer.textContent.length,
      functionCallCount: this.buffer.functionCalls.length,
      functionResponseCount: this.buffer.functionResponses.length,
      thinkingLength: this.buffer.thinkingContent.length
    };
  }

  /**
   * 清空缓冲区
   */
  clearBuffer(): void {
    this.buffer = {
      textContent: '',
      functionCalls: [],
      functionResponses: [],
      thinkingContent: ''
    };
    this.processedFunctionCalls.clear();
    this.processedTextHashes.clear();
    this.lastTextContent = '';
  }

  /**
   * 检查是否有待处理的工具调用
   */
  hasPendingToolCalls(): boolean {
    return this.buffer.functionCalls.length > this.buffer.functionResponses.length;
  }

  /**
   * 获取未匹配的工具调用
   */
  getUnmatchedToolCalls(): Array<{ name: string; args: any; id: string }> {
    const responseCallIds = new Set(this.buffer.functionResponses.map(r => r.callId));
    return this.buffer.functionCalls.filter(call => !responseCallIds.has(call.id));
  }

  /**
   * 合并文本片段
   */
  mergeTextFragments(fragments: string[]): string {
    return fragments.join('');
  }

  /**
   * 格式化流式事件
   */
  formatStreamEvent(eventType: string, data: any, index?: number): ClaudeStreamEvent {
    const baseEvent: Partial<ClaudeStreamEvent> = {
      type: eventType as any
    };

    if (index !== undefined) {
      baseEvent.index = index;
    }

    // 根据事件类型添加特定数据
    switch (eventType) {
      case 'message_start':
        return {
          type: 'message_start',
          message: {
            id: this.messageId,
            type: 'message',
            role: 'assistant',
            model: this.model,
            content: [],
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 }
          }
        };

      case 'content_block_start':
        return {
          type: 'content_block_start',
          index: index || 0,
          content_block: data
        };

      case 'content_block_delta':
        return {
          type: 'content_block_delta',
          index: index || 0,
          delta: data
        };

      case 'content_block_stop':
        return {
          type: 'content_block_stop',
          index: index || 0
        };

      case 'message_delta':
        return {
          type: 'message_delta',
          delta: data.delta,
          usage: data.usage
        };

      case 'message_stop':
        return {
          type: 'message_stop'
        };

      case 'error':
        return {
          type: 'error',
          error: data
        };

      default:
        return baseEvent as ClaudeStreamEvent;
    }
  }

  /**
   * 创建增量文本事件
   */
  createTextDelta(text: string, index: number = 0): ClaudeStreamEvent {
    return this.formatStreamEvent('content_block_delta', {
      type: 'text_delta',
      text: text
    }, index);
  }

  /**
   * 创建工具输入增量事件
   */
  createInputJsonDelta(partialJson: string, index: number = 0): ClaudeStreamEvent {
    return this.formatStreamEvent('content_block_delta', {
      type: 'input_json_delta',
      partial_json: partialJson
    }, index);
  }

  /**
   * 验证流式块的完整性
   */
  validateStreamBlock(block: ClaudeContentBlock): {
    isValid: boolean;
    errors: string[];
    canProcess: boolean;
  } {
    const errors: string[] = [];
    let isValid = true;
    let canProcess = true;

    if (!block.type) {
      errors.push('Block missing type field');
      isValid = false;
      canProcess = false;
    }

    switch (block.type) {
      case 'text':
        if (!block.text && block.text !== '') {
          errors.push('Text block missing text field');
          canProcess = false;
        }
        break;

      case 'tool_use':
        if (!block.id) {
          errors.push('Tool use block missing id field');
          canProcess = false;
        }
        if (!block.name) {
          errors.push('Tool use block missing name field');
          canProcess = false;
        }
        break;

      case 'thinking':
        if (!block.thinking && block.thinking !== '') {
          errors.push('Thinking block missing thinking field');
          canProcess = false;
        }
        break;
    }

    return { isValid, errors, canProcess };
  }

  /**
   * 获取流式处理统计
   */
  getStreamingStats(): {
    messageId: string;
    model: string;
    processedFunctionCalls: number;
    bufferState: ReturnType<StreamTransformer['getBufferState']>;
    hasUnmatchedCalls: boolean;
  } {
    return {
      messageId: this.messageId,
      model: this.model,
      processedFunctionCalls: this.processedFunctionCalls.size,
      bufferState: this.getBufferState(),
      hasUnmatchedCalls: this.hasPendingToolCalls()
    };
  }
}