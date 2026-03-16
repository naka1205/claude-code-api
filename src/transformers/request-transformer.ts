/**
 * 请求转换器 - Cloudflare Workers版本
 * 负责将Claude格式请求转换为Gemini格式
 */

import {
  ClaudeRequest,
  ClaudeMessage,
  ClaudeContent,
  ClaudeSystemMessage,
  ClaudeTool
} from '../types/claude';
import {
  GeminiRequest,
  GeminiContent,
  GeminiPart,
  GeminiRole,
  GeminiSystemInstruction,
  GeminiGenerationConfig,
  GeminiTool,
  GeminiFunctionDeclaration
} from '../types/gemini';
import { ModelMapper } from '../models';
import { ContentTransformer } from './content-transformer';
import { ToolTransformer } from './tool-transformer';
import { ThinkingTransformer } from './thinking-transformer';

export interface TransformOptions {
  enableSpecialToolHandling?: boolean;
  maxOutputTokens?: number;
  safeOutputTokenLimiting?: boolean;
  enableValidation?: boolean;
  enableThinking?: boolean;
}

export interface ValidationWarning {
  type: 'warning' | 'info';
  message: string;
  parameter?: string;
}

export interface TransformResult {
  request: GeminiRequest;
  warnings: ValidationWarning[];
}

export class RequestTransformer {
  private static defaultOptions: TransformOptions = {
    enableSpecialToolHandling: false,
    safeOutputTokenLimiting: true,
    enableValidation: true,
    enableThinking: true
  };

  /**
   * 主转换函数：将Claude请求转换为Gemini请求
   */
  static async transformRequest(
    claudeRequest: ClaudeRequest,
    options?: TransformOptions
  ): Promise<TransformResult> {
    const transformOptions = { ...this.defaultOptions, ...options };
    const warnings: ValidationWarning[] = [];

    try {
      // 1. 参数验证
      if (transformOptions.enableValidation) {
        this.validateClaudeRequest(claudeRequest, warnings);
      }

      // 2. 处理Claude特有参数
      this.processClaudeSpecificParams(claudeRequest, warnings);

      // 3. 映射模型名称
      const modelMapper = ModelMapper.getInstance();
      const geminiModel = modelMapper.mapModel(claudeRequest.model);

      // 4. 预处理消息（处理WebSearch工具调用转换）- 恢复自Node.js版本
      const processedMessages = this.preprocessMessages(claudeRequest.messages);

      // 5. 转换消息内容
      const contents = await this.transformMessages(processedMessages);

      // 6. 转换生成配置
      const generationConfig = this.transformGenerationConfig(claudeRequest, transformOptions, warnings);

      // 7. 处理 Extended Thinking（为所有情况处理thinking配置）
      const shouldProcessThinking = transformOptions.enableThinking ||
        claudeRequest.thinking ||
        ThinkingTransformer.modelSupportsThinking(geminiModel);

      if (shouldProcessThinking) {
        const thinkingConfig = ThinkingTransformer.transformThinking(
          claudeRequest.thinking,
          geminiModel,
          claudeRequest
        );

        if (thinkingConfig) {
          (generationConfig as any).thinkingConfig = {
            thinkingLevel: thinkingConfig.thinkingLevel,
            includeThoughts: thinkingConfig.includeThoughts
          };
        }
      }

      // 8. 处理系统消息和缓存
      let geminiRequest: GeminiRequest = {
        contents,
        generationConfig
      };

      // 处理系统消息
      let systemInstruction = claudeRequest.system ? this.transformSystemMessage(claudeRequest.system) : null;

      // 9. 处理工具
      if (claudeRequest.tools && claudeRequest.tools.length > 0) {
        try {
          // 根据官方文档建议：推荐10-20个工具为最大值
          const limitedTools = claudeRequest.tools.slice(0, 30);
          const toolResult = ToolTransformer.convertTools(limitedTools);

          // 记录工具转换警告和错误
          if (toolResult.errors && toolResult.errors.length > 0) {
            warnings.push({
              type: 'warning',
              message: `Tool conversion issues: ${toolResult.errors.length} errors found`,
              parameter: 'tools'
            });
          }

          if (toolResult.tools.length > 0) {
            geminiRequest.tools = toolResult.tools;
          }

          // 检测到特殊工具，启用特殊工具处理
          if (toolResult.hasSpecialTools) {
            transformOptions.enableSpecialToolHandling = true;
          }

          if (claudeRequest.tool_choice) {
            const toolConfig = ToolTransformer.convertToolChoice(claudeRequest.tool_choice, limitedTools);
            if (toolConfig) {
              geminiRequest.toolConfig = toolConfig;
            }
          }
        } catch (error) {
          warnings.push({
            type: 'warning',
            message: `Tool conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            parameter: 'tools'
          });
          // 继续处理，不让工具转换失败影响整个请求
        }
      }

      if (systemInstruction) {
        geminiRequest.systemInstruction = systemInstruction;
      }

      // 10. 处理特殊工具（WebSearch, WebFetch）
      if (transformOptions.enableSpecialToolHandling) {
        this.handleSpecialTools(geminiRequest);
      }

      return { request: geminiRequest, warnings };
    } catch (error) {
      throw new Error(`Request transformation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 预处理消息（处理WebSearch工具调用转换）- 恢复自Node.js版本
   */
  private static preprocessMessages(messages: ClaudeMessage[]): ClaudeMessage[] {
    // 检查是否有WebSearch工具调用和错误响应
    const hasWebSearchCall = this.hasWebSearchCallInMessages(messages);
    const hasWebSearchResponse = this.hasWebSearchResponseInMessages(messages);
    const hasWebSearchError = this.hasWebSearchErrorInMessages(messages);

    if (hasWebSearchCall && (!hasWebSearchResponse || hasWebSearchError)) {
      return this.convertWebSearchMessages(messages);
    }

    return messages;
  }

  /**
   * 验证Claude请求参数
   */
  private static validateClaudeRequest(request: ClaudeRequest, warnings: ValidationWarning[]): void {
    // 检查不兼容的参数组合
    if (request.temperature !== undefined && request.top_p !== undefined) {
      warnings.push({
        type: 'warning',
        message: 'temperature and top_p should not be used together. Claude documentation recommends using only one.',
        parameter: 'temperature,top_p'
      });
    }

    // 检查Claude特有的参数
    const claudeSpecificParams = ['anthropic-version', 'anthropic-beta'];
    claudeSpecificParams.forEach(param => {
      if ((request as any)[param]) {
        warnings.push({
          type: 'info',
          message: `Parameter ${param} is Claude-specific and will be ignored in Gemini conversion.`,
          parameter: param
        });
      }
    });

    // 检查消息数量限制
    if (request.messages.length > 100000) {
      warnings.push({
        type: 'warning',
        message: 'Message count exceeds Claude limit of 100,000. This may cause issues.',
        parameter: 'messages'
      });
    }

    // 检查max_tokens范围
    if (request.max_tokens < 1) {
      warnings.push({
        type: 'warning',
        message: 'max_tokens must be >= 1',
        parameter: 'max_tokens'
      });
    }

    // 检查temperature范围
    if (request.temperature !== undefined && (request.temperature < 0 || request.temperature > 1)) {
      warnings.push({
        type: 'warning',
        message: 'temperature should be between 0 and 1',
        parameter: 'temperature'
      });
    }

    // 检查top_p范围
    if (request.top_p !== undefined && (request.top_p < 0 || request.top_p > 1)) {
      warnings.push({
        type: 'warning',
        message: 'top_p should be between 0 and 1',
        parameter: 'top_p'
      });
    }

    // 检查top_k范围
    if (request.top_k !== undefined && request.top_k < 0) {
      warnings.push({
        type: 'warning',
        message: 'top_k should be >= 0',
        parameter: 'top_k'
      });
    }
  }

  /**
   * 转换消息列表
   */
  private static async transformMessages(messages: ClaudeMessage[]): Promise<GeminiContent[]> {
    const contents: GeminiContent[] = [];
    const toolUseTracker = new Map<string, string>(); // tool_use_id -> tool_name

    for (const message of messages) {
      // 先收集tool_use信息供后续tool_result使用
      if (message.role === 'assistant' && Array.isArray(message.content)) {
        for (const item of message.content) {
          if ((item as any).type === 'tool_use') {
            const toolUse = item as any;
            toolUseTracker.set(toolUse.id, toolUse.name);
          }
        }
      }

      // 处理tool_result时注入正确的工具名称
      let processedContent = message.content;
      if (Array.isArray(message.content)) {
        processedContent = message.content.map((item: any) => {
          if (item.type === 'tool_result' && item.tool_use_id) {
            const toolName = toolUseTracker.get(item.tool_use_id);
            if (toolName) {
              return { ...item, tool_name: toolName };
            }
          }
          return item;
        });
      }

      // 🔑 关键修复:处理thinking+signature的情况
      // 根据Gemini官方格式,signature必须附加到下一个非thinking block上
      const parts = await this.transformMessagesWithSignature(processedContent);

      // 映射角色 - 处理包括tool角色
      let role: GeminiRole;
      if (message.role === 'assistant') {
        role = 'model';
      } else if (message.role === 'user') {
        // 检查是否包含tool_result，如果是则作为tool角色
        if (Array.isArray(message.content) &&
          message.content.some((c: any) => c.type === 'tool_result')) {
          role = 'tool' as GeminiRole;
        } else {
          role = 'user';
        }
      } else {
        role = 'user'; // 默认为user
      }

      // 过滤掉空的parts
      const validParts = parts.filter(part => part !== null);
      if (validParts.length > 0) {
        contents.push({
          role,
          parts: validParts
        });
      }
    }

    return contents;
  }

  /**
   * 转换消息内容并正确处理thinking+signature
   * 根据Gemini格式规范,thoughtSignature必须附加到thinking之后的第一个part上
   */
  private static async transformMessagesWithSignature(content: string | ClaudeContent[]): Promise<GeminiPart[]> {
    if (typeof content === 'string') {
      return [{ text: content }];
    }

    const parts: GeminiPart[] = [];
    let pendingSignature: string | undefined;

    for (let i = 0; i < content.length; i++) {
      const item = content[i];

      // 检查是否是thinking block with signature
      if ((item as any).type === 'thinking') {
        const thinkingBlock = item as any;
        const hasValidSignature =
          thinkingBlock.signature &&
          typeof thinkingBlock.signature === 'string' &&
          thinkingBlock.signature.length > 100;

        if (hasValidSignature) {
          // 保存signature,稍后附加到正确的part上
          pendingSignature = thinkingBlock.signature;
        }

        // 添加thinking part (不包含signature)
        if (thinkingBlock.thinking) {
          parts.push({
            text: thinkingBlock.thinking,
            thought: true
          });
        }
        continue;
      }

      // 转换当前item
      const part = await ContentTransformer.transformContentItem(item);
      if (part) {
        parts.push(part);
      }
    }

    // 附加pendingSignature到正确的part上
    // Gemini要求thoughtSignature在functionCall part上（如果有），否则在第一个非thinking part上
    if (pendingSignature) {
      const functionCallPart = parts.find(p => 'functionCall' in p);
      if (functionCallPart) {
        (functionCallPart as any).thoughtSignature = pendingSignature;
      } else {
        // 没有functionCall时，附加到第一个非thinking part
        const targetPart = parts.find(p => !('thought' in p));
        if (targetPart) {
          (targetPart as any).thoughtSignature = pendingSignature;
        }
      }
    }

    return parts;
  }

  /**
   * 转换系统消息
   */
  private static transformSystemMessage(system: string | ClaudeSystemMessage[]): GeminiSystemInstruction {
    let text: string;

    if (typeof system === 'string') {
      text = system;
    } else if (Array.isArray(system)) {
      text = system.map(msg => msg.text).join('\n\n');
    } else {
      text = '';
    }

    return {
      role: 'system',
      parts: [{ text }]
    };
  }

  /**
   * 转换生成配置
   */
  private static transformGenerationConfig(
    claudeRequest: ClaudeRequest,
    options: TransformOptions,
    warnings: ValidationWarning[]
  ): GeminiGenerationConfig {
    const modelMapper = ModelMapper.getInstance();
    const geminiModel = modelMapper.mapModel(claudeRequest.model);

    // 优先级：客户端请求的max_tokens > options中指定的 > 模型推荐默认值
    let requestedMaxTokens = claudeRequest.max_tokens ||
      options.maxOutputTokens ||
      modelMapper.getRecommendedMaxTokens(geminiModel);

    // 检查token限制
    const capabilities = modelMapper.getModelCapabilities(geminiModel);

    // 确保不超过模型能力上限
    const finalMaxTokens = Math.min(requestedMaxTokens, capabilities.maxTokens);

    if (requestedMaxTokens > capabilities.maxTokens) {
      warnings.push({
        type: 'warning',
        message: `Requested max_tokens ${requestedMaxTokens} exceeds model limit ${capabilities.maxTokens}. Adjusted to ${finalMaxTokens}.`,
        parameter: 'max_tokens'
      });
    }

    const config: GeminiGenerationConfig = {
      maxOutputTokens: finalMaxTokens * 2,
      temperature: claudeRequest.temperature,
      topP: claudeRequest.top_p,
      topK: claudeRequest.top_k,
      stopSequences: claudeRequest.stop_sequences
    };

    // 移除undefined值
    Object.keys(config).forEach(key => {
      if (config[key as keyof GeminiGenerationConfig] === undefined) {
        delete config[key as keyof GeminiGenerationConfig];
      }
    });

    return config;
  }

  /**
   * 处理Claude特有参数 - 简化版
   */
  private static processClaudeSpecificParams(request: ClaudeRequest, warnings: ValidationWarning[]): void {
    // 检查Claude特有的参数
    const claudeSpecificParams = ['anthropic-version', 'anthropic-beta'];
    claudeSpecificParams.forEach(param => {
      if ((request as any)[param]) {
        warnings.push({
          type: 'info',
          message: `Parameter ${param} is Claude-specific and will be ignored in Gemini conversion.`,
          parameter: param
        });
      }
    });
  }

  /**
   * 处理特殊工具（WebSearch, WebFetch）- 恢复自Node.js版本
   */
  private static handleSpecialTools(geminiRequest: GeminiRequest): void {
    // 特殊工具的处理主要在工具转换阶段完成
    // WebSearch已经转换为google_search工具
    // 这里可以添加额外的特殊工具配置
    if (geminiRequest.tools) {
      geminiRequest.tools.forEach(tool => {
        if ((tool as any).google_search) {
          // 可以在这里添加搜索配置优化
          // 例如根据消息内容优化搜索参数
        }
      });
    }
  }

  /**
   * 检测消息中是否有WebSearch工具调用
   */
  private static hasWebSearchCallInMessages(messages: ClaudeMessage[]): boolean {
    return messages.some(message =>
      Array.isArray(message.content) &&
      message.content.some((block: any) =>
        block.type === 'tool_use' && block.name === 'WebSearch'
      )
    );
  }

  /**
   * 检测消息中是否有WebSearch响应
   */
  private static hasWebSearchResponseInMessages(messages: ClaudeMessage[]): boolean {
    return messages.some(message =>
      Array.isArray(message.content) &&
      message.content.some((block: any) =>
        block.type === 'tool_result' && (block.name === 'WebSearch' || block.tool_name === 'WebSearch')
      )
    );
  }

  /**
   * 检测消息中是否有WebSearch错误
   */
  private static hasWebSearchErrorInMessages(messages: ClaudeMessage[]): boolean {
    return messages.some(message =>
      Array.isArray(message.content) &&
      message.content.some((block: any) => {
        if (block.type === 'tool_result' && (block.name === 'WebSearch' || block.tool_name === 'WebSearch')) {
          const toolResult = block as any;
          const responseText = toolResult.content || '';
          // 检查错误标识
          return (toolResult.is_error === true) ||
            (typeof responseText === 'string' && (
              responseText.includes('MALFORMED_FUNCTION_CALL') ||
              responseText.includes('上游返回空内容') ||
              responseText.includes('finishReason=') ||
              responseText.includes('error') ||
              responseText.includes('failed')
            ));
        }
        return false;
      })
    );
  }

  /**
   * 转换WebSearch错误消息为文本消息 - 恢复自Node.js版本
   */
  private static convertWebSearchMessages(messages: ClaudeMessage[]): ClaudeMessage[] {
    return messages.map(message => {
      if (Array.isArray(message.content)) {
        const convertedContent = message.content.map((block: any) => {
          // 将失败的WebSearch调用转换为文本
          if (block.type === 'tool_use' && block.name === 'WebSearch') {
            return {
              type: 'text' as const,
              text: block.input?.query || '搜索请求'
            };
          }
          // 将WebSearch错误结果转换为重试提示
          if (block.type === 'tool_result' && (block.name === 'WebSearch' || block.tool_name === 'WebSearch')) {
            const toolResult = block as any;
            const responseText = toolResult.content || '';
            const isError = toolResult.is_error === true;

            if (isError || (typeof responseText === 'string' && (
              responseText.includes('MALFORMED_FUNCTION_CALL') ||
              responseText.includes('上游返回空内容') ||
              responseText.includes('finishReason=') ||
              responseText.includes('error') ||
              responseText.includes('failed')
            ))) {
              return {
                type: 'text' as const,
                text: `之前的搜索出现问题，请重新搜索：${block.input?.query || responseText}`
              };
            }
          }
          return block;
        });
        return { ...message, content: convertedContent };
      }
      return message;
    });
  }

  /**
   * 处理WebFetch到URL Context的转换 - 恢复自Node.js版本
   * 注意：此功能当前被禁用，需要根据实际需求决定是否启用
   */
  private static handleWebFetchToUrlContext(
    toolUseBlock: any,
    parts: GeminiPart[]
  ): void {
    if (!toolUseBlock.input) return;
    const { url, prompt } = toolUseBlock.input;
    if (!url) return;

    // 根据Gemini官方文档，URL Context通过在文本中包含URL实现
    if (prompt) {
      parts.push({ text: `Please analyze the content from ${url} and answer: ${prompt}` });
    } else {
      parts.push({ text: `Please analyze the content from ${url}` });
    }
  }
}