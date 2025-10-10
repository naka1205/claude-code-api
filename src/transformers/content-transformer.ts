/**
 * 内容转换器
 * 处理Claude和Gemini之间的内容格式转换
 * 确保thinking、工具调用等内容的正确处理
 */

import {
  ClaudeContent,
  ClaudeContentBlock,
  ClaudeTextContent,
  ClaudeImageContent,
  ClaudeDocumentContent,
  ClaudeToolResult,
  ClaudeThinkingBlock
} from '../types/claude';
import { GeminiPart, GeminiTextPart, GeminiInlineDataPart } from '../types/gemini';
import { ThinkingTransformer } from './thinking-transformer';

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
        const toolResult = item as ClaudeToolResult;
        // 从映射中获取工具名称
        const toolName = toolResult.tool_use_id ?
          (this.functionCallMap.get(toolResult.tool_use_id) || (item as any).name || (item as any).tool_name || 'unknown_tool') :
          ((item as any).name || (item as any).tool_name || 'unknown_tool');

        // 根据是否有错误，构建不同的响应格式
        if (toolResult.is_error) {
          // 错误响应格式（符合Gemini官方推荐）
          return {
            functionResponse: {
              name: toolName,
              response: {
                error: {
                  code: toolResult.error_code || 'INTERNAL_ERROR',
                  message: toolResult.content || '工具执行失败',
                  details: toolResult.error_details || {}
                }
              }
            }
          };
        } else {
          // 成功响应格式
          const responseContent = typeof toolResult.content === 'string'
            ? { result: toolResult.content }
            : Array.isArray(toolResult.content)
            ? { result: (toolResult.content as any[]).map((c: any) => c.text || c).join('\n') }
            : toolResult.content || { success: true };

          return {
            functionResponse: {
              name: toolName,
              response: {
                ...responseContent,
                tool_use_id: toolResult.tool_use_id
              }
            }
          };
        }

      case 'thinking':
        // Claude的thinking内容不应该发送给Gemini
        // 这是Claude特有的内容类型，Gemini不支持
        return null;

      default:
        
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
   * 验证工具参数，确保必要参数存在
   */
  private static validateToolArguments(toolName: string, input: any): Record<string, any> {
    const args = input || {};

    // 根据工具名称验证必要参数
    switch (toolName?.toLowerCase()) {
      case 'bash':
      case 'bash_20250124':
        if (!args.command) {
          
          // 提供默认值以防止错误
          return { command: 'echo "No command provided"' };
        }
        break;

      case 'webfetch':
      case 'web_fetch':
      case 'web_fetch_20250305':
        if (!args.url) {
          
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
          
          return { query: 'search query' };
        }
        break;

      case 'code_execution':
      case 'code_execution_20250124':
        if (!args.code) {
          
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

    // 收集所有thinking内容，合并为单个block
    const thinkingParts: string[] = [];
    const textParts: string[] = [];

    // 第一轮：按照Gemini的标记分类内容
    for (const part of parts) {
      // 处理标记为thought的内容 (不包括仅有thoughtSignature的part)
      // thoughtSignature单独出现时表示thinking阶段结束,不是thinking内容本身
      if ('thought' in part && 'text' in part && (part as any).thought === true && (part as any).text) {
        thinkingParts.push((part as any).text);
        continue;
      }

      // 普通文本内容 - 与流式处理保持一致的过滤条件
      // 排除thought标记、functionCall,并检查text真值
      if ('text' in part && part.text && !('thought' in part) && !('functionCall' in part)) {
        textParts.push(part.text);
        continue;
      }

      // 处理工具调用 (可能包含thoughtSignature作为结束标记)
      if ('functionCall' in part && part.functionCall) {
        const toolHash = this.generateToolCallHash(part.functionCall.name, part.functionCall.args);

        if (processedToolCalls.has(toolHash)) {
          continue;
        }
        processedToolCalls.add(toolHash);

        const cached = this.toolCallCache.get(toolHash);
        let toolUseId: string;
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
          toolUseId = cached.id;
        } else {
          toolUseId = this.generateToolUseId();
          this.toolCallCache.set(toolHash, { id: toolUseId, timestamp: Date.now() });
        }

        toolCallMap.set(part.functionCall.name + '_' + toolUseId, toolUseId);
        this.functionCallMap.set(toolUseId, part.functionCall.name);

        blocks.push({
          type: 'tool_use',
          id: toolUseId,
          name: part.functionCall.name,
          input: part.functionCall.args || {}
        } as any);
      }
    }

    // 第二轮：处理thinking内容
    if (thinkingParts.length > 0 && exposeThinkingToClient) {
      console.log(`[ContentTransformer] Processing ${thinkingParts.length} thinking parts, expose=${exposeThinkingToClient}`);

      // 合并所有thinking内容为单个block
      const combinedThinking = thinkingParts.join('\n\n');

      // 查找thoughtSignature (在最后一个thinking chunk后的part中)
      const signaturePart = parts.find(p => 'thoughtSignature' in p);
      const geminiSignature = signaturePart ? (signaturePart as any).thoughtSignature : undefined;

      const thinkingBlock: ClaudeThinkingBlock = {
        type: 'thinking',
        thinking: combinedThinking,
        // 直接使用Gemini返回的原始签名
        signature: ThinkingTransformer.convertGeminiSignatureToClaudeFormat(geminiSignature)
      };
      blocks.push(thinkingBlock);
      console.log(`[ContentTransformer] Created thinking block with signature from Gemini`);
    }

    // 第三轮：处理普通文本内容
    if (textParts.length > 0) {
      const combinedText = textParts.join('\n\n');
      blocks.push({
        type: 'text',
        text: combinedText
      });
    }

    // 第四轮：处理工具响应
    const processedResponses = new Set<string>();
    for (const part of parts) {
      if ('functionResponse' in part && part.functionResponse) {
        const matchingToolUseId = Array.from(toolCallMap.entries())
          .find(([key, id]) => key.includes(part.functionResponse.name))?.[1];

        const toolUseId = matchingToolUseId || this.generateToolUseId();
        const responseHash = `${part.functionResponse.name}_${toolUseId}_${this.simpleHash(JSON.stringify(part.functionResponse.response))}`;

        if (processedResponses.has(responseHash)) {
          continue;
        }
        processedResponses.add(responseHash);

        const response = part.functionResponse.response as any;
        const isError = !!response?.error;

        blocks.push({
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: isError ?
            (response.error.message || '工具执行失败') :
            (response.result || response.content || JSON.stringify(response)),
          is_error: isError,
          error_code: isError ? response.error.code : undefined,
          error_details: isError ? response.error.details : undefined
        } as ClaudeToolResult);
      }
    }

    // Logger.info('ContentTransformer', `Final result: ${blocks.length} blocks (${thinkingParts.length} thinking, ${textParts.length} text)`);

    // 最终fallback检查：与流式输出保持一致的处理
    // if (blocks.length === 0 && thinkingParts.length > 0 && !exposeThinkingToClient) {
    //   // Logger.warn('ContentTransformer', 'No content blocks generated but thinking content exists - providing fallback');
    //   blocks.push({
    //     type: 'text',
    //     text: 'I have completed the analysis. To see the detailed reasoning process, please enable thinking mode.'
    //   });
    // }

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