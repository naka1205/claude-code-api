/**
 * 内容转换器 - Cloudflare Workers版本
 * 处理Claude和Gemini之间的内容格式转换
 */

import {
  ClaudeContent,
  ClaudeTextContent,
  ClaudeImageContent,
  ClaudeDocumentContent
} from '../types/claude';
import { GeminiPart, GeminiTextPart, GeminiInlineDataPart } from '../types/gemini';

export class ContentTransformer {
  /**
   * 转换Claude内容到Gemini格式
   */
  static async transformContent(content: string | ClaudeContent[]): Promise<GeminiPart[]> {
    if (typeof content === 'string') {
      return [{ text: content }];
    }

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
  private static async transformContentItem(item: ClaudeContent): Promise<GeminiPart | null> {
    switch (item.type) {
      case 'text':
        return this.transformTextContent(item as ClaudeTextContent);

      case 'image':
        return this.transformImageContent(item as ClaudeImageContent);

      case 'document':
        return this.transformDocumentContent(item as ClaudeDocumentContent);

      default:
        console.warn(`Unknown content type: ${(item as any).type}`);
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
}