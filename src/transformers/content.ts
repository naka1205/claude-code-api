/**
 * 内容转换器 V2
 * 负责转换Claude和Gemini之间的内容块格式
 */

import { ClaudeContentBlock } from '../types/claude';
import { GeminiPart } from '../types/gemini';

export class ContentTransformer {
  private static functionCallMap = new Map<string, string>(); // callId -> functionName
  private static toolCallCache = new Map<string, { id: string, timestamp: number }>(); // 工具调用缓存：hash -> {id, timestamp}
  private static readonly CACHE_TTL = 60000; // 缓存生存时间：60秒

  /**
   * 将Claude内容块转换为Gemini部分
   */
  static convertContentBlock(block: ClaudeContentBlock): GeminiPart[] {
    const parts: GeminiPart[] = [];

    switch (block.type) {
      case 'text':
        if (block.text) {
          parts.push({ text: block.text });
        }
        break;

      case 'image':
        // 根据Gemini官方文档，图像应该转换为内联数据格式
        if (block.source) {
          // 对于base64图像，Gemini API支持直接处理
          const mimeType = this.convertMediaTypeToMimeType(block.source.media_type);
          parts.push({
            inlineData: {
              mimeType: mimeType,
              data: block.source.data
            }
          } as any); // 临时使用any，因为GeminiPart类型需要更新
        }
        break;

      case 'tool_use':
        if (block.name && block.input) {
          // 记录函数调用映射
          if (block.id) {
            this.functionCallMap.set(block.id, block.name);
          }
          parts.push({
            functionCall: {
              name: block.name,
              args: block.input
            }
          });
        }
        break;

      case 'tool_result':
        if (block.tool_use_id) {
          // 从映射中获取工具名称
          const toolName = this.functionCallMap.get(block.tool_use_id) || 'unknown_tool';

          parts.push({
            functionResponse: {
              name: toolName,
              response: {
                content: block.content,
                is_error: block.is_error || false,
                tool_use_id: block.tool_use_id
              }
            }
          });
        }
        break;

      case 'thinking':
        if (block.thinking) {
          parts.push({
            text: block.thinking,
            thought: true
          });
        }
        break;

      default:
        // 未知类型当作文本处理
        if ('text' in block && block.text) {
          parts.push({ text: block.text });
        }
    }

    return parts;
  }

  /**
   * 将Gemini部分转换为Claude内容块 - 优化版
   */
  static transformContent(parts: GeminiPart[], exposeThinkingToClient: boolean = false): ClaudeContentBlock[] {
    const blocks: ClaudeContentBlock[] = [];
    let accumulatedText = '';

    // 清理过期缓存
    this.cleanExpiredCache();

    const flushText = () => {
      if (accumulatedText) {
        blocks.push({
          type: 'text',
          text: accumulatedText
        });
        accumulatedText = '';
      }
    };

    for (const part of parts) {
      if (part.text !== undefined) {
        // 判断是否是思考内容
        // 只有当part.thought为true时才是思考内容
        // thoughtSignature是加密的上下文令牌，用于多轮对话，不应显示
        const isThinkingContent = part.thought === true;

        if (isThinkingContent) {
          // 如果是thinking内容，只有在exposeThinkingToClient为true时才处理
          if (exposeThinkingToClient) {
            flushText();
            blocks.push({
              type: 'thinking',
              thinking: part.text,
              signature: this.generateThinkingSignature(part.text)
            });
          }
          // 如果exposeThinkingToClient为false，则跳过thinking内容
        } else {
          // 不是thinking内容，累积为普通文本
          // 即使有thoughtSignature，text本身也是普通响应内容
          accumulatedText += part.text;
        }
      } else if (part.functionCall) {
        flushText();

        // 生成工具调用哈希以检测重复
        const toolHash = this.generateToolCallHash(part.functionCall.name, part.functionCall.args);
        const cached = this.toolCallCache.get(toolHash);

        let toolUseId: string;
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
          // 使用缓存的ID，避免重复
          toolUseId = cached.id;
        } else {
          // 生成新ID并缓存
          toolUseId = this.generateToolUseId();
          this.toolCallCache.set(toolHash, { id: toolUseId, timestamp: Date.now() });
        }

        // 记录映射
        this.functionCallMap.set(toolUseId, part.functionCall.name);
        blocks.push({
          type: 'tool_use',
          id: toolUseId,
          name: part.functionCall.name,
          input: part.functionCall.args || {}
        });
      } else if (part.functionResponse) {
        flushText();
        blocks.push({
          type: 'tool_result',
          tool_use_id: (part.functionResponse.response as any)?.tool_use_id || this.generateToolUseId(),
          content: part.functionResponse.response,
          is_error: (part.functionResponse.response as any)?.is_error || false
        });
      }
    }

    flushText();
    return blocks;
  }

  /**
   * 处理工具调用和响应的配对
   */
  static processToolCallsAndResults(parts: GeminiPart[], exposeThinkingToClient: boolean = false): ClaudeContentBlock[] {
    const blocks: ClaudeContentBlock[] = [];
    const toolCallMap = new Map<string, string>(); // functionCall name -> tool_use_id

    // 第一轮：处理所有内容并创建工具调用映射
    for (const part of parts) {
      // thoughtSignature是加密的上下文令牌，不应该显示
      // 跳过它，只处理text内容
      if (part.text !== undefined) {
        // 检查是否是纯thinking内容（通过thought标记）
        const isPureThinkingContent = part.thought === true;

        if (isPureThinkingContent) {
          // 纯thinking内容，只有在exposeThinkingToClient为true时才处理
          if (exposeThinkingToClient) {
            blocks.push({
              type: 'thinking',
              thinking: part.text,
              signature: this.generateThinkingSignature(part.text)
            });
          }
        } else {
          // 普通文本内容（即使有thoughtSignature，text仍是普通响应）
          blocks.push({
            type: 'text',
            text: part.text
          });
        }
      } else if (part.functionCall && part.functionCall.name) {
        // 生成工具调用哈希以检测重复
        const toolHash = this.generateToolCallHash(part.functionCall.name, part.functionCall.args);
        const cached = this.toolCallCache.get(toolHash);

        let toolUseId: string;

        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
          // 检测到重复的工具调用，跳过
          toolUseId = cached.id;

          // 检查是否已经存在相同的工具调用
          const existingCall = blocks.find(b => b.type === 'tool_use' && b.id === toolUseId);
          if (existingCall) {
            continue; // 跳过重复的工具调用
          }
        } else {
          // 生成新ID并缓存
          toolUseId = this.generateToolUseId();
          this.toolCallCache.set(toolHash, { id: toolUseId, timestamp: Date.now() });
        }

        toolCallMap.set(part.functionCall.name, toolUseId);

        // 检查是否为特殊工具调用，需要特殊处理
        const isSpecialTool = this.isSpecialTool(part.functionCall.name);

        blocks.push({
          type: 'tool_use',
          id: toolUseId,
          name: part.functionCall.name,
          input: part.functionCall.args || {}
        });

        // 如果是特殊工具，立即生成响应
        if (isSpecialTool) {
          const specialResponse = this.generateSpecialToolResponse(part.functionCall.name, part.functionCall.args);
          blocks.push({
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: specialResponse,
            is_error: false
          });
        }
      }
    }

    // 第二轮：处理工具响应（需要与工具调用配对）
    for (const part of parts) {
      if (part.functionResponse && part.functionResponse.name) {
        const toolUseId = toolCallMap.get(part.functionResponse.name) || this.generateToolUseId();
        
        blocks.push({
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: part.functionResponse.response,
          is_error: !!(part.functionResponse.response as any)?.is_error
        });
      }
    }

    return blocks;
  }

  /**
   * 清空函数调用映射（在新会话开始时调用）
   */
  static clearFunctionCallMap(): void {
    this.functionCallMap.clear();
    this.toolCallCache.clear();
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
  static generateToolUseId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `toolu_${timestamp}_${random}`;
  }

  /**
   * 生成推理签名
   */
  private static generateThinkingSignature(thinkingContent: string): string {
    const timestamp = Date.now().toString(36);
    const hash = this.simpleHash(thinkingContent);
    return `sig_${hash}_${timestamp}`;
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
   * 转换媒体类型到MIME类型
   */
  private static convertMediaTypeToMimeType(mediaType: string): string {
    // Claude使用的媒体类型到Gemini MIME类型的映射
    const mimeTypeMap: Record<string, string> = {
      'image/jpeg': 'image/jpeg',
      'image/png': 'image/png', 
      'image/gif': 'image/gif',
      'image/webp': 'image/webp'
    };
    
    return mimeTypeMap[mediaType] || mediaType;
  }


  /**
   * 验证内容块格式
   */
  static validateContentBlocks(blocks: ClaudeContentBlock[]): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    blocks.forEach((block, index) => {
      const prefix = `Block ${index}`;
      
      if (!block.type) {
        errors.push(`${prefix}: Missing type field`);
        return;
      }

      switch (block.type) {
        case 'text':
          if (!block.text) {
            errors.push(`${prefix}: Text block missing text field`);
          } else if (typeof block.text !== 'string') {
            errors.push(`${prefix}: Text field must be string`);
          } else if (block.text.trim().length === 0) {
            warnings.push(`${prefix}: Text block has empty content`);
          }
          break;

        case 'image':
          if (!block.source) {
            errors.push(`${prefix}: Image block missing source field`);
          } else {
            if (!block.source.type || block.source.type !== 'base64') {
              errors.push(`${prefix}: Image source type must be 'base64'`);
            }
            if (!block.source.media_type) {
              errors.push(`${prefix}: Image source missing media_type`);
            }
            if (!block.source.data) {
              errors.push(`${prefix}: Image source missing data`);
            }
          }
          break;

        case 'tool_use':
          if (!block.id) {
            errors.push(`${prefix}: Tool use block missing id field`);
          }
          if (!block.name) {
            errors.push(`${prefix}: Tool use block missing name field`);
          }
          if (block.input === undefined) {
            warnings.push(`${prefix}: Tool use block missing input field`);
          }
          break;

        case 'tool_result':
          if (!block.tool_use_id) {
            errors.push(`${prefix}: Tool result block missing tool_use_id field`);
          }
          if (block.content === undefined) {
            warnings.push(`${prefix}: Tool result block missing content field`);
          }
          break;

        case 'thinking':
          if (!block.thinking) {
            errors.push(`${prefix}: Thinking block missing thinking field`);
          }
          if (!block.signature) {
            warnings.push(`${prefix}: Thinking block missing signature field`);
          }
          break;

        default:
          errors.push(`${prefix}: Unknown block type '${block.type}'`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 统计内容块信息
   */
  static getContentStats(blocks: ClaudeContentBlock[]): {
    totalBlocks: number;
    typeDistribution: Record<string, number>;
    totalTextLength: number;
    toolUseCount: number;
    imageCount: number;
    thinkingCount: number;
  } {
    const typeDistribution: Record<string, number> = {};
    let totalTextLength = 0;
    let toolUseCount = 0;
    let imageCount = 0;
    let thinkingCount = 0;

    blocks.forEach(block => {
      typeDistribution[block.type] = (typeDistribution[block.type] || 0) + 1;

      switch (block.type) {
        case 'text':
          if (block.text) totalTextLength += block.text.length;
          break;
        case 'tool_use':
          toolUseCount++;
          break;
        case 'image':
          imageCount++;
          break;
        case 'thinking':
          thinkingCount++;
          if (block.thinking) totalTextLength += block.thinking.length;
          break;
      }
    });

    return {
      totalBlocks: blocks.length,
      typeDistribution,
      totalTextLength,
      toolUseCount,
      imageCount,
      thinkingCount
    };
  }

  /**
   * 合并相邻的文本块
   */
  static mergeAdjacentTextBlocks(blocks: ClaudeContentBlock[]): ClaudeContentBlock[] {
    const merged: ClaudeContentBlock[] = [];
    let currentTextBlock: ClaudeContentBlock | null = null;

    for (const block of blocks) {
      if (block.type === 'text' && block.text) {
        if (currentTextBlock && currentTextBlock.type === 'text') {
          // 合并到现有文本块
          currentTextBlock.text = (currentTextBlock.text || '') + '\n' + block.text;
        } else {
          // 开始新的文本块
          currentTextBlock = { ...block };
          merged.push(currentTextBlock);
        }
      } else {
        // 非文本块，直接添加
        currentTextBlock = null;
        merged.push(block);
      }
    }

    return merged;
  }

  /**
   * 拆分过长的文本块
   */
  static splitLongTextBlocks(
    blocks: ClaudeContentBlock[], 
    maxLength: number = 4000
  ): ClaudeContentBlock[] {
    const result: ClaudeContentBlock[] = [];

    for (const block of blocks) {
      if (block.type === 'text' && block.text && block.text.length > maxLength) {
        // 拆分长文本
        const chunks = this.splitText(block.text, maxLength);
        chunks.forEach(chunk => {
          result.push({
            type: 'text',
            text: chunk
          });
        });
      } else {
        result.push(block);
      }
    }

    return result;
  }

  /**
   * 拆分文本
   */
  private static splitText(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let currentPos = 0;

    while (currentPos < text.length) {
      let endPos = currentPos + maxLength;
      
      if (endPos >= text.length) {
        chunks.push(text.slice(currentPos));
        break;
      }

      // 尝试在单词边界处拆分
      const lastSpacePos = text.lastIndexOf(' ', endPos);
      const lastNewlinePos = text.lastIndexOf('\n', endPos);
      const splitPos = Math.max(lastSpacePos, lastNewlinePos);

      if (splitPos > currentPos) {
        endPos = splitPos;
      }

      chunks.push(text.slice(currentPos, endPos).trim());
      currentPos = endPos + 1;
    }

    return chunks.filter(chunk => chunk.length > 0);
  }
}