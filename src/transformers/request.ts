/**
 * 请求转换器 V2
 * 负责将Claude格式请求转换为Gemini格式
 */

import { ClaudeRequest, ClaudeMessage, ClaudeContentBlock } from '../types/claude';
import { GeminiRequest, GeminiContent, GeminiPart } from '../types/gemini';

import { ModelMapper } from '../models';
import { ThinkingTransformer } from './thinking';
import { ToolTransformer } from './tool';
import { ContentTransformer } from './content';

export interface TransformOptions {
  enableSpecialToolHandling?: boolean;
  maxOutputTokens?: number;
  safeOutputTokenLimiting?: boolean;
}

export class RequestTransformer {
  // 使用常量优化内存使用
  private static readonly defaultOptions: Readonly<TransformOptions> = Object.freeze({
    // 默认禁用特殊工具自动处理（遵循本项目以官方文档为准且不进行网络搜索的约定）
    enableSpecialToolHandling: false,
    safeOutputTokenLimiting: true
  });

  /**
   * 主转换函数：将Claude请求转换为Gemini请求 (优化版本)
   * 针对 Cloudflare Workers 环境优化，减少内存分配
   */
  static transformRequest(claudeRequest: ClaudeRequest, options?: TransformOptions): GeminiRequest {
    let transformOptions = options ? Object.assign({}, this.defaultOptions, options) : this.defaultOptions;

    try {
      // 1. 映射模型名称
      const geminiModel = ModelMapper.mapModel(claudeRequest.model);

      // 2. 预处理和转换消息内容
      const processedMessages = this.preprocessMessages(claudeRequest.messages);
      const contents = this.transformMessages(processedMessages, claudeRequest.system);

      // 3. 转换生成配置
      const generationConfig = this.transformGenerationConfig(claudeRequest, transformOptions);

      // 4. 处理 Extended Thinking（仅当用户显式开启时）
      if (claudeRequest.thinking && claudeRequest.thinking.type === 'enabled') {
        const thinkingConfig = ThinkingTransformer.transformThinking(
          claudeRequest.thinking,
          geminiModel,
          claudeRequest
        );
        if (thinkingConfig && ModelMapper.getCapabilities(geminiModel).supportsThinking) {
          generationConfig.thinkingConfig = {
            thinkingBudget: thinkingConfig.thinkingBudget,
            includeThoughts: thinkingConfig.includeThoughts || true  // 请求返回思考内容
          };
        }
      }

      // 5. 构建基础请求
      const geminiRequest: GeminiRequest = {
        contents,
        generationConfig
      };

      // 6. 处理工具转换（基于BAK目录逻辑和官方文档修复）
      if (claudeRequest.tools && claudeRequest.tools.length > 0) {
        const toolResult = ToolTransformer.convertTools(claudeRequest.tools);
        if (toolResult.tools.length > 0) {
          geminiRequest.tools = toolResult.tools;
        }
        
        // 如果检测到特殊工具，启用特殊工具处理
        if (toolResult.hasSpecialTools && transformOptions.enableSpecialToolHandling !== true) {
          // 创建新的选项对象以启用特殊工具处理
          const newOptions = { ...transformOptions, enableSpecialToolHandling: true };
          transformOptions = newOptions;
        }
        
        if (claudeRequest.tool_choice) {
          const toolConfig = ToolTransformer.convertToolChoice(claudeRequest.tool_choice, claudeRequest.tools);
          if (toolConfig) {
            geminiRequest.toolConfig = toolConfig;
          }
        }
      }

      // 8. 处理特殊工具（WebSearch, WebFetch）
      if (transformOptions.enableSpecialToolHandling) {
        this.handleSpecialTools(geminiRequest);
      }

      // 9. 添加系统指令
      this.addSystemInstruction(claudeRequest.system, contents, geminiRequest);

      return geminiRequest;
    } catch (error) {
      // 减少错误字符串拼接开销
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Request transformation failed: ${errorMsg}`);
    }
  }

  /**
   * 预处理消息（处理WebSearch工具调用转换）
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
   * 转换消息内容 (性能优化版本)
   */
  private static transformMessages(messages: ClaudeMessage[], system?: string | ClaudeContentBlock[]): GeminiContent[] {
    // 预分配数组大小以优化性能
    const contents: GeminiContent[] = new Array(messages.length);

    // 处理系统消息
    const systemText = this.normalizeSystemToText(system);
    const hasSystem = !!systemText;
    const shouldMergeSystem = hasSystem && messages.length > 0 && messages[0]?.role === 'user';

    // 使用传统 for 循环优化性能
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const geminiRole = message.role === 'assistant' ? 'model' : 'user';
      const parts: GeminiPart[] = [];

      // 如果是第一个用户消息且需要合并系统消息
      if (i === 0 && shouldMergeSystem) {
        parts.push({ text: systemText });
      }

      // 转换消息内容
      if (typeof message.content === 'string') {
        parts.push({ text: message.content });
      } else {
        message.content.forEach(block => {
          // 暂时禁用WebFetch到URL Context的转换，让它作为普通工具调用处理
          // 这样可以避免重复响应的问题
          /*
          if (block.type === 'tool_use' &&
              (block.name === 'WebFetch' || block.name === 'web_fetch')) {
            this.handleWebFetchToUrlContext(block, parts);
          } else {
          */
            const convertedParts = ContentTransformer.convertContentBlock(block);
            parts.push(...convertedParts);
          /*
          }
          */
        });
      }

      contents[i] = {
        role: geminiRole,
        parts: parts
      };
    }

    // 标准化工具名称
    return this.normalizeToolNames(contents);
  }

  /**
   * 转换生成配置
   */
  private static transformGenerationConfig(claudeRequest: ClaudeRequest, options: TransformOptions): any {
    const config: any = {};

    // 转换maxOutputTokens - 根据Gemini官方文档调整限制
    if (claudeRequest.max_tokens) {
      if (options.safeOutputTokenLimiting) {
        config.maxOutputTokens = ModelMapper.getSafeOutputTokenLimit(
          claudeRequest.model,
          claudeRequest.max_tokens
        );
      } else {
        // 根据Gemini官方文档，不同模型有不同的输出token限制
        const geminiModel = ModelMapper.mapModel(claudeRequest.model);
        const maxAllowed = this.getModelMaxOutputTokens(geminiModel);
        config.maxOutputTokens = Math.min(claudeRequest.max_tokens, maxAllowed);
      }

      // 确保最小值为 50，避免 Gemini 返回空内容
      if (config.maxOutputTokens < 50) {
        config.maxOutputTokens = 50;
      }
    }

    // 转换采样参数 - 根据Gemini API文档优化范围
    if (claudeRequest.temperature !== undefined) {
      // Gemini API支持0-2的temperature范围，但推荐0-1
      config.temperature = Math.max(0, Math.min(2, claudeRequest.temperature));
    }

    if (claudeRequest.top_p !== undefined) {
      config.topP = Math.max(0, Math.min(1, claudeRequest.top_p));
    }

    if (claudeRequest.top_k !== undefined) {
      // Gemini API的topK范围是1-40，0表示不使用
      if (claudeRequest.top_k === 0) {
        // 不设置topK字段，让模型使用默认值
      } else {
        config.topK = Math.max(1, Math.min(40, claudeRequest.top_k));
      }
    }

    // 转换停止序列
    if (claudeRequest.stop_sequences && claudeRequest.stop_sequences.length > 0) {
      // Gemini API支持最多5个停止序列
      config.stopSequences = claudeRequest.stop_sequences.slice(0, 5);
    }

    // 根据官方文档，某些高级参数的处理
    if (claudeRequest.service_tier && claudeRequest.service_tier === 'standard_only') {
      // Gemini没有直接对应的service_tier，但可以通过其他方式优化
      config.candidateCount = 1; // 确保只返回一个候选
    }

    return config;
  }

  // 使用静态常量优化内存和查找性能
  private static readonly MODEL_TOKEN_LIMITS: Readonly<Record<string, number>> = Object.freeze({
    'gemini-2.5-pro': 8192,
    'gemini-2.5-flash': 8192,
    'gemini-2.5-flash-lite': 8192,
    'gemini-2.0-flash': 8192,
    'gemini-2.0-flash-lite': 8192,
    // 向后兼容
    'gemini-1.5-pro': 8192,
    'gemini-1.5-flash': 8192,
    'gemini-1.0-pro': 2048
  });

  /**
   * 获取模型的最大输出token限制
   */
  private static getModelMaxOutputTokens(geminiModel: string): number {
    return this.MODEL_TOKEN_LIMITS[geminiModel] || 4096;
  }

  /**
   * 处理特殊工具（WebSearch, WebFetch）- 基于BAK逻辑恢复功能
   */
  private static handleSpecialTools(geminiRequest: GeminiRequest): void {
    // 实际上，特殊工具的处理主要在工具转换阶段完成
    // WebSearch已经转换为google_search工具
    // WebFetch在内容转换时处理为URL Context
    
    // 这里可以添加额外的特殊工具配置，比如搜索参数优化等
    if (geminiRequest.tools) {
      geminiRequest.tools.forEach(tool => {
        if (tool.google_search) {
          // 可以在这里添加搜索配置优化
          // 例如根据消息内容优化搜索参数
        }
      });
    }
  }

  /**
   * 添加增强的Google Search工具 (基于官方文档)
   */
  // 移除未使用的扩展 Google Search 注入方法（保留占位注释以说明意图）

  /**
   * 从消息中提取搜索查询
   */
  // 移除未使用的方法：extractSearchQueries
  

  /**
   * 根据搜索查询优化搜索配置
   */
  // 移除未使用的方法：optimizeSearchConfig

  // 移除未使用的方法：containsChinese

  /**
   * 添加特殊工具到请求中 (更新版本)
   */
  // 移除未使用的方法：addSpecialTool

  /**
   * 添加系统指令
   */
  private static addSystemInstruction(
    system: string | ClaudeContentBlock[] | undefined,
    contents: GeminiContent[],
    geminiRequest: GeminiRequest
  ): void {
    const systemText = this.normalizeSystemToText(system);
    
    if (systemText && contents.length > 0 && contents[0]?.role === 'model') {
      // 如果第一条消息是模型消息，说明系统提示没有被合并，需要单独处理
      geminiRequest.systemInstruction = {
        parts: [{ text: systemText.trim() }]
      };
    }
  }

  /**
   * 标准化系统提示为文本 (优化版本)
   */
  private static normalizeSystemToText(system?: string | ClaudeContentBlock[]): string {
    if (!system) return '';

    if (typeof system === 'string') {
      return system;
    }

    if (Array.isArray(system)) {
      // 使用 StringBuilder 模式优化字符串拼接
      const texts: string[] = [];
      for (const block of system) {
        if (block.type === 'text' && block.text) {
          texts.push(block.text);
        }
      }
      return texts.join('\n');
    }

    return '';
  }

  /**
   * 标准化工具名称
   */
  private static normalizeToolNames(contents: GeminiContent[]): GeminiContent[] {
    const normalizeToolName = (name: string): string => {
      if (!name) return name;
      const n = String(name);
      const lower = n.toLowerCase();
      if (lower === 'web_search' || lower === 'websearch') return 'WebSearch';
      if (lower === 'webfetch' || lower === 'web_fetch') return 'WebFetch';
      return n;
    };

    return contents.map(content => ({
      ...content,
      parts: content.parts.map(part => {
        if (part.functionCall?.name) {
          return {
            ...part,
            functionCall: {
              ...part.functionCall,
              name: normalizeToolName(part.functionCall.name)
            }
          };
        }
        if (part.functionResponse?.name) {
          return {
            ...part,
            functionResponse: {
              ...part.functionResponse,
              name: normalizeToolName(part.functionResponse.name)
            }
          };
        }
        return part;
      })
    }));
  }

  /**
   * 转换WebFetch调用为URL Context功能
   */
  // 移除未使用的方法：convertWebFetchToUrlContext

  // Helper methods for detecting tool calls
  private static hasWebSearchCallInMessages(messages: ClaudeMessage[]): boolean {
    return messages.some(message => 
      Array.isArray(message.content) && 
      message.content.some(block => 
        block.type === 'tool_use' && block.name === 'WebSearch'
      )
    );
  }

  private static hasWebSearchResponseInMessages(messages: ClaudeMessage[]): boolean {
    return messages.some(message => 
      Array.isArray(message.content) && 
      message.content.some(block => 
        block.type === 'tool_result' && block.name === 'WebSearch'
      )
    );
  }

  private static hasWebSearchErrorInMessages(messages: ClaudeMessage[]): boolean {
    return messages.some(message => 
      Array.isArray(message.content) && 
      message.content.some(block => {
        if (block.type === 'tool_result' && block.name === 'WebSearch') {
          const responseText = block.content || '';
          return typeof responseText === 'string' && (
            responseText.includes('MALFORMED_FUNCTION_CALL') ||
            responseText.includes('上游返回空内容') ||
            responseText.includes('finishReason=')
          );
        }
        return false;
      })
    );
  }


  /**
   * 转换WebFetch调用为URL Context功能
   * 目前已禁用，保留以备将来使用
   */
  /*
  private static handleWebFetchToUrlContext(
    toolUseBlock: ClaudeContentBlock,
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
  */

  private static convertWebSearchMessages(messages: ClaudeMessage[]): ClaudeMessage[] {
    // 优化：只在需要时创建新数组
    const result: ClaudeMessage[] = new Array(messages.length);

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      if (Array.isArray(message.content)) {
        const convertedContent = message.content.map(block => {
          if (block.type === 'tool_use' && block.name === 'WebSearch') {
            return {
              type: 'text' as const,
              text: block.input?.query || '搜索请求'
            };
          }
          if (block.type === 'tool_result' && block.name === 'WebSearch') {
            return {
              type: 'text' as const,
              text: `之前的搜索出现问题，请重新搜索：${block.content || ''}`
            };
          }
          return block;
        });
        result[i] = { ...message, content: convertedContent };
      } else {
        result[i] = message;
      }
    }
    return result;
  }

  /**
   * 获取转换统计信息
   */
  static getTransformationStats(claudeRequest: ClaudeRequest, geminiRequest: GeminiRequest) {
    const originalModel = claudeRequest.model;
    const targetModel = ModelMapper.mapModel(originalModel);
    const messageCount = claudeRequest.messages.length;
    const toolCount = claudeRequest.tools ? claudeRequest.tools.length : 0;
    const hasThinking = !!(claudeRequest.thinking || geminiRequest.generationConfig?.thinkingConfig);
    const systemText = this.normalizeSystemToText(claudeRequest.system);
    const hasSystemPrompt = systemText.trim().length > 0;

    const contentBlocks = claudeRequest.messages.reduce((total, msg) => {
      if (typeof msg.content === 'string') {
        return total + 1;
      }
      return total + msg.content.length;
    }, 0);

    return {
      originalModel,
      targetModel,
      messageCount,
      toolCount,
      hasThinking,
      hasSystemPrompt,
      contentBlocks,
      transformedContentsCount: geminiRequest.contents.length,
      hasSpecialTools: !!(geminiRequest.tools?.some(tool => tool.google_search || tool.url_context))
    };
  }
}