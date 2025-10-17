/**
 * 流式响应转换器
 * 基于官方文档实现Claude和Gemini流式响应的正确转换
 *
 * 核心流式场景（参考 README.md）：
 * 1. 纯文本响应
 * 2. Thinking(暴露) + 文本
 * 3. Thinking(隐藏) + 文本
 * 4. Thinking + 文本 + 工具
 * 5. 多个Thinking块 + 文本 + 工具
 * 6. Thinking + 工具调用(无文本)
 * 7. 仅工具调用
 * 8. 仅Thinking（错误场景）
 *
 * 关键发现（参考 Gemini.md）：
 * - thoughtSignature 如果存在推理，表示推理结束
 * - thoughtSignature 可以与 text 或 functionCall 同级出现
 * - thoughtsTokenCount 在流式响应中逐块递增
 * - thinking 结束后才开始输出 text 或 tool_use
 */

import {
  ClaudeStreamEvent,
  ClaudeResponse,
  ClaudeContentBlock,
  ClaudeTextBlock,
  ClaudeThinkingBlock,
  ClaudeToolUse
} from '../types/claude';
import { GeminiStreamResponse, GeminiPart } from '../types/gemini';
import { ThinkingTransformer } from './thinking-transformer';
import { Logger } from '../utils/logger';

/**
 * 流状态枚举
 */
enum StreamState {
  NOT_STARTED = 'NOT_STARTED',
  THINKING = 'THINKING',          // 正在输出 thinking
  TEXT = 'TEXT',                  // 正在输出文本
  TOOL_USE = 'TOOL_USE',          // 正在输出工具调用
  COMPLETED = 'COMPLETED'         // 已完成
}

/**
 * 流状态管理器
 * 正确处理Claude流式事件序列和内容块状态
 */
class StreamStateManager {
  private state: StreamState = StreamState.NOT_STARTED;
  private messageStarted: boolean = false;
  private thinkingBlockStarted: boolean = false;
  private thinkingBlockIndex: number = -1;
  private textBlockStarted: boolean = false;
  private textBlockIndex: number = -1;
  private currentBlockIndex: number = 0;

  private accumulatedThinking: string = '';
  private accumulatedText: string = '';

  private thinkingSignature: string = '';

  private totalInputTokens: number = 0;
  private totalOutputTokens: number = 0;

  private processedFunctionCalls: Set<string> = new Set();

  private geminiChunks: any[] = [];
  private claudeEvents: Array<{ type: string; data: any }> = [];
  private finalFinishReason: string = '';
  private finalUsageMetadata: any = null;

  private indexMap: Map<number, number> = new Map();

  /**
   * 检查消息是否已开始
   */
  isMessageStarted(): boolean {
    return this.messageStarted;
  }

  /**
   * 标记消息已开始
   */
  setMessageStarted(inputTokens: number): void {
    this.messageStarted = true;
    this.totalInputTokens = inputTokens;
  }

  /**
   * 获取当前状态
   */
  getState(): StreamState {
    return this.state;
  }

  /**
   * 是否在 thinking 阶段
   */
  isThinkingPhase(): boolean {
    return this.state === StreamState.THINKING;
  }

  /**
   * 是否 thinking 块已开始
   */
  isThinkingBlockStarted(): boolean {
    return this.thinkingBlockStarted;
  }

  /**
   * 开始 thinking 块
   */
  startThinkingBlock(): number {
    if (!this.thinkingBlockStarted) {
      this.thinkingBlockIndex = this.currentBlockIndex;
      this.thinkingBlockStarted = true;
      this.state = StreamState.THINKING;
      this.currentBlockIndex++;
    }
    return this.thinkingBlockIndex;
  }

  /**
   * 结束 thinking 块
   */
  stopThinkingBlock(): void {
    this.thinkingBlockStarted = false;
    // 重置累积的thinking,为下一个thinking块做准备
    this.accumulatedThinking = '';
  }

  /**
   * 处理 thinking 增量内容（去重）
   * Gemini 可能累积发送，需要提取增量
   */
  processThinkingDelta(newThinking: string): string | null {
    if (!newThinking) return null;

    // 完全重复
    if (this.accumulatedThinking === newThinking) {
      return null;
    }

    // 累积式内容（Gemini常见模式）
    if (newThinking.startsWith(this.accumulatedThinking)) {
      const delta = newThinking.substring(this.accumulatedThinking.length);
      if (!delta) return null;
      this.accumulatedThinking = newThinking;
      return delta;
    }

    // 检查是否已包含
    if (this.accumulatedThinking.includes(newThinking.trim())) {
      return null;
    }

    // 全新内容
    const delta = newThinking;
    this.accumulatedThinking += newThinking;
    return delta;
  }

  /**
   * 是否文本块已开始
   */
  isTextBlockStarted(): boolean {
    return this.textBlockStarted;
  }

  /**
   * 开始文本块
   */
  startTextBlock(): number {
    if (!this.textBlockStarted) {
      this.textBlockIndex = this.currentBlockIndex;
      this.textBlockStarted = true;
      this.state = StreamState.TEXT;
      this.currentBlockIndex++;
    }
    return this.textBlockIndex;
  }

  /**
   * 结束文本块
   */
  stopTextBlock(): void {
    this.textBlockStarted = false;
    // 重置累积的文本,为下一个文本块做准备
    this.accumulatedText = '';
  }

  /**
   * 处理文本增量内容（去重）
   */
  processTextDelta(newText: string): string | null {
    if (!newText) return null;

    // 完全重复
    if (this.accumulatedText === newText) {
      return null;
    }

    // 累积式内容
    if (newText.startsWith(this.accumulatedText)) {
      const delta = newText.substring(this.accumulatedText.length);
      if (!delta) return null;
      this.accumulatedText = newText;
      return delta;
    }

    // 全新内容 - 直接追加
    const delta = newText;
    this.accumulatedText += newText;
    return delta;
  }

  /**
   * 获取下一个块索引
   */
  getNextBlockIndex(): number {
    const index = this.currentBlockIndex;
    this.currentBlockIndex++;
    return index;
  }

  /**
   * 获取当前块索引
   */
  getCurrentBlockIndex(): number {
    return this.currentBlockIndex;
  }

  /**
   * 设置 thinking signature
   */
  setThinkingSignature(signature: string): void {
    this.thinkingSignature = signature;
  }

  /**
   * 获取 thinking signature
   */
  getThinkingSignature(): string {
    return this.thinkingSignature;
  }

  /**
   * 检查函数调用是否已处理（去重）
   */
  isFunctionCallProcessed(functionCall: any): boolean {
    const signature = JSON.stringify({ name: functionCall.name, args: functionCall.args });
    return this.processedFunctionCalls.has(signature);
  }

  /**
   * 标记函数调用已处理
   */
  markFunctionCallProcessed(functionCall: any): void {
    const signature = JSON.stringify({ name: functionCall.name, args: functionCall.args });
    this.processedFunctionCalls.add(signature);
  }

  /**
   * 检查是否有工具调用
   */
  hasToolUse(): boolean {
    return this.processedFunctionCalls.size > 0;
  }

  /**
   * 设置输出 tokens
   */
  setOutputTokens(tokens: number): void {
    this.totalOutputTokens = tokens;
  }

  /**
   * 获取输入 tokens
   */
  getInputTokens(): number {
    return this.totalInputTokens;
  }

  /**
   * 获取输出 tokens
   */
  getOutputTokens(): number {
    return this.totalOutputTokens;
  }

  /**
   * 标记流已完成
   */
  markCompleted(): void {
    this.state = StreamState.COMPLETED;
  }

  /**
   * 是否已完成
   */
  isCompleted(): boolean {
    return this.state === StreamState.COMPLETED;
  }

  addGeminiChunk(chunk: any): void {
    this.geminiChunks.push(chunk);

    if (chunk.candidates?.[0]?.finishReason) {
      this.finalFinishReason = chunk.candidates[0].finishReason;
    }
    if (chunk.usageMetadata) {
      this.finalUsageMetadata = chunk.usageMetadata;
    }
  }

  addClaudeEvent(eventType: string, data: any): void {
    this.claudeEvents.push({ type: eventType, data });
  }

  getAggregatedGeminiResponse(): any {
    if (this.geminiChunks.length === 0) return null;

    const allParts: any[] = [];
    let role = 'model';

    for (const chunk of this.geminiChunks) {
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (parts && Array.isArray(parts)) {
        allParts.push(...parts);
      }
      if (chunk.candidates?.[0]?.content?.role) {
        role = chunk.candidates[0].content.role;
      }
    }

    return {
      candidates: [{
        content: {
          parts: allParts,
          role
        },
        finishReason: this.finalFinishReason || 'STOP',
        index: 0
      }],
      usageMetadata: this.finalUsageMetadata || {
        promptTokenCount: this.totalInputTokens,
        candidatesTokenCount: this.totalOutputTokens,
        totalTokenCount: this.totalInputTokens + this.totalOutputTokens
      }
    };
  }

  getAggregatedClaudeResponse(messageId: string, model: string): any {
    const contentBlocks: any[] = [];
    let stopReason = 'end_turn';
    let stopSequence = null;

    for (const event of this.claudeEvents) {
      if (event.type === 'content_block_start') {
        const streamIndex = event.data.index;
        const arrayIndex = contentBlocks.length;
        this.indexMap.set(streamIndex, arrayIndex);

        const block = event.data.content_block;
        if (block.type === 'text') {
          contentBlocks.push({ type: 'text', text: '' });
        } else if (block.type === 'thinking') {
          contentBlocks.push({ type: 'thinking', thinking: '' });
        } else if (block.type === 'tool_use') {
          contentBlocks.push({ ...block });
        }
      } else if (event.type === 'content_block_delta') {
        const delta = event.data.delta;
        const streamIndex = event.data.index;
        const arrayIndex = this.indexMap.get(streamIndex);

        if (arrayIndex !== undefined && contentBlocks[arrayIndex]) {
          if (delta.type === 'text_delta') {
            contentBlocks[arrayIndex].text += delta.text;
          } else if (delta.type === 'thinking_delta') {
            contentBlocks[arrayIndex].thinking += delta.thinking;
          }
        }
      } else if (event.type === 'message_delta') {
        if (event.data.delta?.stop_reason) {
          stopReason = event.data.delta.stop_reason;
        }
        if (event.data.delta?.stop_sequence) {
          stopSequence = event.data.delta.stop_sequence;
        }
      }
    }

    return {
      id: messageId,
      type: 'message',
      role: 'assistant',
      content: contentBlocks,
      model,
      stop_reason: stopReason,
      stop_sequence: stopSequence,
      usage: {
        input_tokens: this.totalInputTokens,
        output_tokens: this.totalOutputTokens
      }
    };
  }
}

export class StreamTransformer {
  /**
   * 生成符合Claude格式的消息ID
   */
  private static generateClaudeMessageId(): string {
    const randomString = Math.random().toString(36).substr(2, 15) +
                        Math.random().toString(36).substr(2, 10);
    return `msg_${randomString.substr(0, 25)}`;
  }

  /**
   * 生成工具使用ID
   */
  private static generateToolUseId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `toolu_${timestamp}_${random}`;
  }

  /**
   * 转换 Gemini finishReason 为 Claude stop_reason
   */
  private static transformStopReason(
    finishReason: string,
    finishMessage?: string,
    hasToolUse?: boolean,
    onlyThinking?: boolean
  ): {
    stop_reason: string;
    stop_sequence?: string;
  } {
    // 优先根据 finishMessage 判断
    if (finishMessage === "Model generated function call(s).") {
      return { stop_reason: 'tool_use' };
    }

    // Gemini的已知bug: 当有function call时，finishReason返回"STOP"而不是专门的tool_call
    // 参考: https://github.com/BerriAI/litellm/issues/12240
    // 解决方案: 检查响应中是否实际包含了functionCall
    if (hasToolUse) {
      return { stop_reason: 'tool_use' };
    }

    // Gemini的已知bug: thinking超出token限制时，finishReason返回"STOP"而不是"MAX_TOKENS"
    // 并且响应中只有thinking,没有text或tool_use (场景8: 错误场景)
    // 参考: https://github.com/googleapis/python-genai/issues/782
    if (onlyThinking && finishReason?.toUpperCase() === 'STOP') {
      return { stop_reason: 'max_tokens' };
    }

    switch (finishReason?.toUpperCase()) {
      case 'STOP':
        return { stop_reason: 'end_turn' };
      case 'MAX_TOKENS':
        return { stop_reason: 'max_tokens' };
      case 'STOP_SEQUENCE':
        return { stop_reason: 'stop_sequence' };
      case 'TOOL_CALLS':
      case 'FUNCTION_CALL':
        return { stop_reason: 'tool_use' };
      case 'SAFETY':
      case 'RECITATION':
      case 'OTHER':
        return { stop_reason: 'end_turn' };
      default:
        return { stop_reason: 'end_turn' };
    }
  }

  /**
   * 创建Gemini到Claude的流转换器
   *
   * @param claudeModel Claude模型名称
   * @param exposeThinkingToClient 是否向客户端暴露thinking内容
   * @param requestId 请求ID（用于日志）
   */
  static createClaudeStreamTransformer(
    claudeModel: string,
    exposeThinkingToClient: boolean = false,
    requestId?: string
  ): TransformStream<Uint8Array, Uint8Array> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = '';
    const messageId = this.generateClaudeMessageId();
    const stateManager = new StreamStateManager();

    return new TransformStream({
      async transform(chunk, controller) {
        try {
          // 辅助函数：发送SSE事件
          const sendEvent = (eventType: string, data: any) => {
            const encoded = encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
            controller.enqueue(encoded);

            // 聚合 Claude 事件
            stateManager.addClaudeEvent(eventType, data);
          };

          // 解析SSE格式的数据
          buffer += decoder.decode(chunk, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim() === '') continue;

            // 解析 data: 行
            let data: string | null = null;
            if (line.startsWith('data: ')) {
              data = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              data = line.slice(5).trim();
            } else if (line.startsWith('{')) {
              data = line.trim();
            } else {
              continue;
            }

            if (!data || data === '[DONE]') continue;

            try {
              const geminiChunk = JSON.parse(data) as GeminiStreamResponse;

              // 聚合 Gemini 响应
              stateManager.addGeminiChunk(geminiChunk);

              // 1. 发送 message_start（首次）
              if (!stateManager.isMessageStarted()) {
                const inputTokens = geminiChunk.usageMetadata?.promptTokenCount || 0;
                stateManager.setMessageStarted(inputTokens);

                // 记录 TTFB
                if (requestId) {
                  Logger.logFirstByte(requestId);
                }

                const messageStart: ClaudeStreamEvent = {
                  type: 'message_start',
                  message: {
                    id: messageId,
                    type: 'message',
                    role: 'assistant',
                    content: [],
                    model: claudeModel,
                    stop_reason: null,
                    stop_sequence: null,
                    usage: {
                      input_tokens: inputTokens,
                      output_tokens: 0
                    }
                  } as ClaudeResponse
                };

                sendEvent('message_start', messageStart);
              }

              // 2. 处理内容块
              if (geminiChunk.candidates?.[0]?.content?.parts) {
                for (const part of geminiChunk.candidates[0].content.parts) {

                  // 2.1 处理 thinking 内容
                  if ('thought' in part && part.thought === true && 'text' in part) {
                    // 只在 exposeThinkingToClient 为 true 时处理
                    if (exposeThinkingToClient) {
                      const thinkingText = part.text;
                      const hasSignature = 'thoughtSignature' in part;

                      // 开始 thinking 块
                      if (!stateManager.isThinkingBlockStarted()) {
                        const blockIndex = stateManager.startThinkingBlock();

                        const thinkingBlockStart: ClaudeStreamEvent = {
                          type: 'content_block_start',
                          index: blockIndex,
                          content_block: {
                            type: 'thinking',
                            thinking: ''
                            // signature 字段在收到 thoughtSignature 时才添加
                          } as ClaudeThinkingBlock
                        };
                        sendEvent('content_block_start', thinkingBlockStart);
                      }

                      // 发送 thinking 增量
                      const delta = stateManager.processThinkingDelta(thinkingText);
                      if (delta) {
                        const thinkingDelta: ClaudeStreamEvent = {
                          type: 'content_block_delta',
                          index: stateManager.startThinkingBlock(),
                          delta: { type: 'thinking_delta', thinking: delta }
                        };
                        sendEvent('content_block_delta', thinkingDelta);
                      }

                      // 检查签名（thinking 结束标志）
                      if (hasSignature) {
                        const geminiSignature = (part as any).thoughtSignature;
                        const claudeSignature = ThinkingTransformer.convertGeminiSignatureToClaudeFormat(geminiSignature);

                        // 只在有有效签名时设置
                        if (claudeSignature) {
                          stateManager.setThinkingSignature(claudeSignature);

                          // ⚠️ 关键：发送 thinking block 的最终状态（包含 signature）
                          // 在 content_block_stop 之前，需要发送一个带有完整 signature 的 delta
                          const thinkingSignatureDelta: ClaudeStreamEvent = {
                            type: 'content_block_delta',
                            index: stateManager.startThinkingBlock(),
                            delta: {
                              type: 'thinking_delta',
                              thinking: ''  // 空内容，仅用于传递 signature 更新
                            }
                          };
                          sendEvent('content_block_delta', thinkingSignatureDelta);
                        }

                        // 结束 thinking 块
                        const thinkingBlockStop: ClaudeStreamEvent = {
                          type: 'content_block_stop',
                          index: stateManager.startThinkingBlock()
                        };
                        sendEvent('content_block_stop', thinkingBlockStop);
                        stateManager.stopThinkingBlock();
                      }
                    } else {
                      // exposeThinkingToClient = false，但需要检查签名以结束 thinking 阶段
                      if ('thoughtSignature' in part) {
                        const geminiSignature = (part as any).thoughtSignature;
                        const claudeSignature = ThinkingTransformer.convertGeminiSignatureToClaudeFormat(geminiSignature);
                        if (claudeSignature) {
                          stateManager.setThinkingSignature(claudeSignature);
                        }
                      }
                    }
                  }

                  // 2.2 处理包含 thoughtSignature 但无 thought 标记的文本
                  // 这种情况下，thoughtSignature 与对话文本一起返回
                  else if ('thoughtSignature' in part && 'text' in part && !('thought' in part)) {
                    const geminiSignature = (part as any).thoughtSignature;
                    const claudeSignature = ThinkingTransformer.convertGeminiSignatureToClaudeFormat(geminiSignature);
                    if (claudeSignature) {
                      stateManager.setThinkingSignature(claudeSignature);
                    }

                    // 结束 thinking 块（如果正在进行）
                    if (stateManager.isThinkingBlockStarted() && exposeThinkingToClient) {
                      const thinkingBlockStop: ClaudeStreamEvent = {
                        type: 'content_block_stop',
                        index: stateManager.startThinkingBlock()
                      };
                      sendEvent('content_block_stop', thinkingBlockStop);
                      stateManager.stopThinkingBlock();
                    }

                    // 处理文本内容
                    const textContent = part.text;
                    const delta = stateManager.processTextDelta(textContent);
                    if (delta) {
                      // 开始文本块
                      if (!stateManager.isTextBlockStarted()) {
                        const blockIndex = stateManager.startTextBlock();
                        const textBlockStart: ClaudeStreamEvent = {
                          type: 'content_block_start',
                          index: blockIndex,
                          content_block: { type: 'text', text: '' } as ClaudeTextBlock
                        };
                        sendEvent('content_block_start', textBlockStart);
                      }

                      // 发送文本增量
                      const textDelta: ClaudeStreamEvent = {
                        type: 'content_block_delta',
                        index: stateManager.startTextBlock(),
                        delta: { type: 'text_delta', text: delta }
                      };
                      sendEvent('content_block_delta', textDelta);
                    }
                  }

                  // 2.3 处理普通文本（无 thought 标记，无 functionCall）
                  else if ('text' in part && part.text && !('thought' in part) && !('functionCall' in part)) {
                    const textContent = part.text;
                    const delta = stateManager.processTextDelta(textContent);

                    if (delta) {
                      // 结束 thinking 块（如果正在进行）
                      if (stateManager.isThinkingBlockStarted() && exposeThinkingToClient) {
                        const thinkingBlockStop: ClaudeStreamEvent = {
                          type: 'content_block_stop',
                          index: stateManager.startThinkingBlock()
                        };
                        sendEvent('content_block_stop', thinkingBlockStop);
                        stateManager.stopThinkingBlock();
                      }

                      // 开始文本块
                      if (!stateManager.isTextBlockStarted()) {
                        const blockIndex = stateManager.startTextBlock();
                        const textBlockStart: ClaudeStreamEvent = {
                          type: 'content_block_start',
                          index: blockIndex,
                          content_block: { type: 'text', text: '' } as ClaudeTextBlock
                        };
                        sendEvent('content_block_start', textBlockStart);
                      }

                      // 发送文本增量
                      const textDelta: ClaudeStreamEvent = {
                        type: 'content_block_delta',
                        index: stateManager.startTextBlock(),
                        delta: { type: 'text_delta', text: delta }
                      };
                      sendEvent('content_block_delta', textDelta);
                    }
                  }

                  // 2.4 处理工具调用
                  else if ('functionCall' in part && part.functionCall) {
                    // 去重检查
                    if (stateManager.isFunctionCallProcessed(part.functionCall)) {
                      continue;
                    }
                    stateManager.markFunctionCallProcessed(part.functionCall);

                    // 检查是否包含 thoughtSignature（工具调用 + signature）
                    if ('thoughtSignature' in part) {
                      const geminiSignature = (part as any).thoughtSignature;
                      const claudeSignature = ThinkingTransformer.convertGeminiSignatureToClaudeFormat(geminiSignature);
                      if (claudeSignature) {
                        stateManager.setThinkingSignature(claudeSignature);
                      }

                      // 结束 thinking 块
                      if (stateManager.isThinkingBlockStarted() && exposeThinkingToClient) {
                        const thinkingBlockStop: ClaudeStreamEvent = {
                          type: 'content_block_stop',
                          index: stateManager.startThinkingBlock()
                        };
                        sendEvent('content_block_stop', thinkingBlockStop);
                        stateManager.stopThinkingBlock();
                      }
                    }

                    // 结束文本块（如果正在进行）
                    if (stateManager.isTextBlockStarted()) {
                      const textBlockStop: ClaudeStreamEvent = {
                        type: 'content_block_stop',
                        index: stateManager.startTextBlock()
                      };
                      sendEvent('content_block_stop', textBlockStop);
                      stateManager.stopTextBlock();
                    }

                    // 发送工具调用
                    const toolUseId = StreamTransformer.generateToolUseId();
                    const blockIndex = stateManager.getNextBlockIndex();

                    let args = part.functionCall.args || {};
                    if (typeof args === 'string') {
                      try {
                        args = JSON.parse(args);
                      } catch {
                        args = {};
                      }
                    }

                    const toolUseBlock: ClaudeToolUse = {
                      type: 'tool_use',
                      id: toolUseId,
                      name: part.functionCall.name,
                      input: args
                    };

                    // content_block_start
                    const toolUseStart: ClaudeStreamEvent = {
                      type: 'content_block_start',
                      index: blockIndex,
                      content_block: toolUseBlock
                    };
                    sendEvent('content_block_start', toolUseStart);

                    // content_block_delta (input_json_delta)
                    const inputDelta: ClaudeStreamEvent = {
                      type: 'content_block_delta',
                      index: blockIndex,
                      delta: {
                        type: 'input_json_delta',
                        partial_json: JSON.stringify(args)
                      }
                    };
                    sendEvent('content_block_delta', inputDelta);

                    // content_block_stop
                    const toolUseStop: ClaudeStreamEvent = {
                      type: 'content_block_stop',
                      index: blockIndex
                    };
                    sendEvent('content_block_stop', toolUseStop);
                  }
                }
              }

              // 3. 处理 finishReason（流完成）
              if (geminiChunk.candidates?.[0]?.finishReason && !stateManager.isCompleted()) {
                const candidate = geminiChunk.candidates[0];

                // 结束所有未结束的块
                if (stateManager.isThinkingBlockStarted() && exposeThinkingToClient) {
                  const thinkingBlockStop: ClaudeStreamEvent = {
                    type: 'content_block_stop',
                    index: stateManager.startThinkingBlock()
                  };
                  sendEvent('content_block_stop', thinkingBlockStop);
                  stateManager.stopThinkingBlock();
                }

                if (stateManager.isTextBlockStarted()) {
                  const textBlockStop: ClaudeStreamEvent = {
                    type: 'content_block_stop',
                    index: stateManager.startTextBlock()
                  };
                  sendEvent('content_block_stop', textBlockStop);
                  stateManager.stopTextBlock();
                }

                // 获取输出 tokens
                const outputTokens = geminiChunk.usageMetadata?.candidatesTokenCount || 0;
                stateManager.setOutputTokens(outputTokens);

                // 检测异常情况: 仅thinking,无text或tool_use (场景8: 错误场景)
                // 这是Gemini的已知bug: thinking超出token限制但finishReason返回STOP而不是MAX_TOKENS
                // 参考: https://github.com/googleapis/python-genai/issues/782
                const hasContent = stateManager.isTextBlockStarted() || stateManager.hasToolUse();
                const onlyThinking = stateManager.isThinkingBlockStarted() && !hasContent;

                // 转换 stop_reason
                const stopInfo = StreamTransformer.transformStopReason(
                  candidate.finishReason || 'STOP',
                  candidate.finishMessage,
                  stateManager.hasToolUse(),
                  onlyThinking  // 传入异常检测结果
                );

                // 发送 message_delta
                const messageDelta: ClaudeStreamEvent = {
                  type: 'message_delta',
                  delta: {
                    type: 'text_delta',  // 需要type字段，但实际不使用
                    stop_reason: stopInfo.stop_reason,
                    stop_sequence: stopInfo.stop_sequence
                  },
                  usage: { output_tokens: outputTokens }
                };
                sendEvent('message_delta', messageDelta);

                // 发送 message_stop
                const messageStop: ClaudeStreamEvent = {
                  type: 'message_stop'
                };
                sendEvent('message_stop', messageStop);

                // 记录完成
                if (requestId) {
                  Logger.finishRequest(requestId);
                }

                stateManager.markCompleted();
              }

            } catch (e) {
              // 忽略 JSON 解析错误
              continue;
            }
          }
        } catch (error) {
          // 发送错误事件
          const errorEvent: ClaudeStreamEvent = {
            type: 'error',
            error: {
              type: 'stream_error',
              message: error instanceof Error ? error.message : 'Stream processing error'
            }
          };
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify(errorEvent)}\n\n`));
        }
      },

      flush(controller) {
        const encoder = new TextEncoder();

        // 确保所有块都被正确结束
        if (stateManager.isMessageStarted() && !stateManager.isCompleted()) {
          // 结束 thinking 块
          if (stateManager.isThinkingBlockStarted()) {
            const thinkingBlockStop = { type: 'content_block_stop', index: stateManager.startThinkingBlock() };
            controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(thinkingBlockStop)}\n\n`));
          }

          // 结束文本块
          if (stateManager.isTextBlockStarted()) {
            const textBlockStop = { type: 'content_block_stop', index: stateManager.startTextBlock() };
            controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(textBlockStop)}\n\n`));
          }

          // 发送 message_delta 和 message_stop
          const messageDelta = {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn' },
            usage: { output_tokens: stateManager.getOutputTokens() }
          };
          controller.enqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify(messageDelta)}\n\n`));

          const messageStop = { type: 'message_stop' };
          controller.enqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify(messageStop)}\n\n`));
        }

        // 记录聚合的响应（无论是否完成都要记录）
        if (requestId && stateManager.isMessageStarted()) {
          const geminiResponse = stateManager.getAggregatedGeminiResponse();
          if (geminiResponse) {
            Logger.logGeminiResponse(
              requestId,
              200,
              'OK',
              {},
              geminiResponse
            );
          }

          const claudeResponse = stateManager.getAggregatedClaudeResponse(messageId, claudeModel);
          Logger.logClaudeResponse(requestId, claudeResponse);

          if (!stateManager.isCompleted()) {
            Logger.finishRequest(requestId);
          }
        }
      }
    });
  }

  /**
   * 创建Gemini流到Claude流的转换管道
   */
  static createStreamPipeline(
    geminiStream: ReadableStream,
    claudeModel: string,
    exposeThinkingToClient: boolean = false,
    requestId?: string
  ): ReadableStream {
    return geminiStream.pipeThrough(
      this.createClaudeStreamTransformer(claudeModel, exposeThinkingToClient, requestId)
    );
  }
}
