/**
 * 内容转换器 - Cloudflare Workers版本
 * 处理Claude和Gemini之间的内容格式转换
 */

import {
  ClaudeContent,
  ClaudeContentBlock,
  ClaudeTextContent,
  ClaudeImageContent,
  ClaudeDocumentContent
} from '../types/claude';
import { GeminiPart, GeminiTextPart, GeminiInlineDataPart } from '../types/gemini';

export class ContentTransformer {
  private static functionCallMap = new Map<string, string>(); // callId -> functionName
  private static toolCallCache = new Map<string, { id: string, timestamp: number }>(); // 工具调用缓存
  private static readonly CACHE_TTL = 60000; // 缓存生存时间：60秒
  /**
   * 转换Claude内容到Gemini格式
   */
  static async transformContent(content: string | ClaudeContent[]): Promise<GeminiPart[]> {
    if (typeof content === 'string') {
      return [{ text: content }];
    }

    // 清理过期缓存
    this.cleanExpiredCache();

    const parts: GeminiPart[] = [];

    for (const item of content) {
      const part = await this.transformContentItem(item);
      if (part) {
        parts.push(part);
      }
    }

    return parts;
  }

  /**
   * 转换单个内容项
   */
  private static async transformContentItem(item: ClaudeContent | any): Promise<GeminiPart | null> {
    switch (item.type) {
      case 'text':
        return this.transformTextContent(item as ClaudeTextContent);

      case 'image':
        return this.transformImageContent(item as ClaudeImageContent);

      case 'document':
        return this.transformDocumentContent(item as ClaudeDocumentContent);

      case 'tool_use':
        // 转换工具使用为Gemini函数调用
        // 验证并处理特殊工具的必要参数
        const toolArgs = this.validateToolArguments(item.name, item.input);

        // 生成工具调用哈希以检测重复
        const toolHash = this.generateToolCallHash(item.name, toolArgs);
        const cached = this.toolCallCache.get(toolHash);

        let toolUseId: string;
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
          // 使用缓存的ID，避免重复
          toolUseId = cached.id;
        } else {
          // 生成新ID并缓存
          toolUseId = item.id || this.generateToolUseId();
          this.toolCallCache.set(toolHash, { id: toolUseId, timestamp: Date.now() });
        }

        // 记录映射
        this.functionCallMap.set(toolUseId, item.name);

        return {
          functionCall: {
            name: item.name,
            args: toolArgs
          }
        };

      case 'tool_result':
        // 转换工具结果为Gemini函数响应
        // 从映射中获取工具名称
        const toolName = item.tool_use_id ?
          (this.functionCallMap.get(item.tool_use_id) || item.name || item.tool_name || 'unknown_tool') :
          (item.name || item.tool_name || 'unknown_tool');

        const responseContent = typeof item.content === 'string'
          ? { result: item.content }
          : Array.isArray(item.content)
          ? { result: item.content.map((c: any) => c.text || c).join('\n') }
          : item.content || { success: true };

        return {
          functionResponse: {
            name: toolName,
            response: {
              ...responseContent,
              is_error: item.is_error || false,
              tool_use_id: item.tool_use_id
            }
          }
        };

      case 'thinking':
        // 处理thinking内容
        if (item.thinking) {
          return {
            text: item.thinking,
            thought: true
          } as any;
        }
        return null;

      default:
        console.warn(`Unknown content type: ${(item as any).type}`);
        // 尝试作为文本处理
        if ((item as any).text) {
          return { text: (item as any).text };
        }
        return null;
    }
  }

  /**
   * 转换文本内容
   */
  private static transformTextContent(content: ClaudeTextContent): GeminiTextPart {
    return { text: content.text };
  }

  /**
   * 转换图像内容
   */
  private static transformImageContent(content: ClaudeImageContent): GeminiInlineDataPart {
    return {
      inlineData: {
        mimeType: content.source.media_type,
        data: content.source.data
      }
    };
  }

  /**
   * 转换文档内容
   */
  private static transformDocumentContent(content: ClaudeDocumentContent): GeminiInlineDataPart {
    return {
      inlineData: {
        mimeType: content.source.media_type,
        data: content.source.data
      }
    };
  }

  /**
   * 转换Gemini内容回Claude格式
   */
  static transformGeminiToClaudeContent(parts: GeminiPart[]): ClaudeContent[] {
    const contents: ClaudeContent[] = [];

    for (const part of parts) {
      if ('text' in part) {
        contents.push({
          type: 'text',
          text: part.text
        });
      } else if ('inlineData' in part) {
        // 根据MIME类型判断是图像还是文档
        const mimeType = part.inlineData.mimeType;
        if (mimeType.startsWith('image/')) {
          contents.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType,
              data: part.inlineData.data
            }
          });
        } else {
          contents.push({
            type: 'document',
            source: {
              type: 'base64',
              media_type: mimeType,
              data: part.inlineData.data
            }
          });
        }
      }
    }

    return contents;
  }

  /**
   * 验证工具参数，确保必要参数存在
   */
  private static validateToolArguments(toolName: string, input: any): Record<string, any> {
    const args = input || {};

    // 根据工具名称验证必要参数
    switch (toolName?.toLowerCase()) {
      case 'bash':
      case 'bash_20250124':
        if (!args.command) {
          console.warn(`Bash tool requires 'command' parameter, got: ${JSON.stringify(args)}`);
          // 提供默认值以防止错误
          return { command: 'echo "No command provided"' };
        }
        break;

      case 'webfetch':
      case 'web_fetch':
      case 'web_fetch_20250305':
        if (!args.url) {
          console.warn(`WebFetch tool requires 'url' parameter, got: ${JSON.stringify(args)}`);
          // 提供默认值以防止错误
          return {
            url: 'https://example.com',
            prompt: args.prompt || 'Fetch and analyze this page'
          };
        }
        if (!args.prompt) {
          args.prompt = 'Analyze the content of this page';
        }
        break;

      case 'websearch':
      case 'web_search':
      case 'web_search_20250305':
        if (!args.query) {
          console.warn(`WebSearch tool requires 'query' parameter, got: ${JSON.stringify(args)}`);
          return { query: 'search query' };
        }
        break;

      case 'code_execution':
      case 'code_execution_20250124':
        if (!args.code) {
          console.warn(`Code execution tool requires 'code' parameter, got: ${JSON.stringify(args)}`);
          return {
            language: args.language || 'python',
            code: 'print("No code provided")'
          };
        }
        break;
    }

    return args;
  }

  /**
   * 生成工具调用哈希
   */
  private static generateToolCallHash(name: string, args: any): string {
    const content = JSON.stringify({ name, args });
    return `tool_${this.simpleHash(content)}_${name}`;
  }

  /**
   * 清理过期的缓存条目
   */
  private static cleanExpiredCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    this.toolCallCache.forEach((value, key) => {
      if (now - value.timestamp > this.CACHE_TTL) {
        expiredKeys.push(key);
      }
    });

    expiredKeys.forEach(key => this.toolCallCache.delete(key));
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
   * 简单哈希函数
   */
  private static simpleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return Math.abs(hash).toString(36).substring(0, 8);
  }

  /**
   * 检查是否为特殊工具
   */
  private static isSpecialTool(toolName: string): boolean {
    const specialTools = ['WebSearch', 'web_search', 'websearch', 'WebFetch', 'web_fetch', 'webfetch'];
    return specialTools.includes(toolName);
  }

  /**
   * 为特殊工具生成响应
   */
  private static generateSpecialToolResponse(toolName: string, args: any): string {
    const name = toolName.toLowerCase();

    if (name === 'websearch' || name === 'web_search') {
      const query = args?.query || 'unknown query';
      return `搜索完成：已搜索"${query}"。由于当前配置，返回基础响应。如需真实搜索结果，请配置Gemini的google_search功能。`;
    }

    if (name === 'webfetch' || name === 'web_fetch') {
      const url = args?.url || 'unknown URL';
      const prompt = args?.prompt || 'analyze content';
      return `页面获取完成：已尝试获取"${url}"并进行"${prompt}"分析。由于当前配置，返回基础响应。如需真实页面内容，请配置Gemini的URL Context功能。`;
    }

    return `工具 ${toolName} 执行完成`;
  }

  /**
   * 清空函数调用映射（在新会话开始时调用）
   */
  static clearFunctionCallMap(): void {
    this.functionCallMap.clear();
    this.toolCallCache.clear();
  }

  /**
   * 处理工具调用和响应的配对（与BAK版本兼容）
   */
  static async processToolCallsAndResults(
    parts: GeminiPart[],
    exposeThinkingToClient: boolean = false
  ): Promise<ClaudeContentBlock[]> {
    const blocks: ClaudeContentBlock[] = [];
    const toolCallMap = new Map<string, string>(); // functionCall name -> tool_use_id
    const processedToolCalls = new Set<string>(); // 防重复处理的工具调用集合

    // 第一轮：处理所有内容并创建工具调用映射
    for (const part of parts) {
      if ('text' in part && part.text !== undefined) {
        // 检查是否是纯thinking内容（通过thought标记）
        const isPureThinkingContent = (part as any).thought === true;

        if (isPureThinkingContent) {
          // 纯thinking内容，只有在exposeThinkingToClient为true时才处理
          if (exposeThinkingToClient) {
            blocks.push({
              type: 'thinking',
              thinking: part.text,
              signature: this.generateThinkingSignature(part.text)
            } as any);
          }
        } else {
          // 普通文本内容
          blocks.push({
            type: 'text',
            text: part.text
          });
        }
      } else if ('functionCall' in part && part.functionCall) {
        // 生成工具调用哈希以检测重复
        const toolHash = this.generateToolCallHash(part.functionCall.name, part.functionCall.args);

        // 检查是否已经处理过这个工具调用
        if (processedToolCalls.has(toolHash)) {
          continue; // 跳过重复的工具调用
        }
        processedToolCalls.add(toolHash);

        const cached = this.toolCallCache.get(toolHash);

        let toolUseId: string;
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
          // 使用缓存的ID
          toolUseId = cached.id;
        } else {
          // 生成新ID并缓存
          toolUseId = this.generateToolUseId();
          this.toolCallCache.set(toolHash, { id: toolUseId, timestamp: Date.now() });
        }

        toolCallMap.set(part.functionCall.name + '_' + toolUseId, toolUseId); // 使用组合键避免冲突
        this.functionCallMap.set(toolUseId, part.functionCall.name);

        blocks.push({
          type: 'tool_use',
          id: toolUseId,
          name: part.functionCall.name,
          input: part.functionCall.args || {}
        } as any);
      }
    }

    // 第二轮：处理工具响应（不自动生成特殊工具响应，等待实际响应）
    const processedResponses = new Set<string>(); // 防重复处理的工具响应集合

    for (const part of parts) {
      if ('functionResponse' in part && part.functionResponse) {
        // 查找对应的工具调用ID
        const matchingToolUseId = Array.from(toolCallMap.entries())
          .find(([key, id]) => key.includes(part.functionResponse.name))?.[1];

        const toolUseId = matchingToolUseId || this.generateToolUseId();

        // 生成响应哈希避免重复处理
        const responseHash = `${part.functionResponse.name}_${toolUseId}_${this.simpleHash(JSON.stringify(part.functionResponse.response))}`;
        if (processedResponses.has(responseHash)) {
          continue; // 跳过重复的工具响应
        }
        processedResponses.add(responseHash);

        blocks.push({
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: part.functionResponse.response,
          is_error: !!(part.functionResponse.response as any)?.is_error
        } as any);
      }
    }

    return blocks;
  }

  /**
   * 生成thinking签名
   */
  private static generateThinkingSignature(thinkingContent: string): string {
    const timestamp = Date.now().toString(36);
    const hash = this.simpleHash(thinkingContent);
    return `sig_${hash}_${timestamp}`;
  }
}