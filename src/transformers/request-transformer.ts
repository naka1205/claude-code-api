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
  GeminiSystemInstruction,
  GeminiGenerationConfig
} from '../types/gemini';
import { ModelMapper } from '../models';
import { ContentTransformer } from './content-transformer';
import { ToolTransformer } from './tool-transformer';

export interface TransformOptions {
  enableSpecialToolHandling?: boolean;
  maxOutputTokens?: number;
  safeOutputTokenLimiting?: boolean;
}

export class RequestTransformer {
  private static defaultOptions: TransformOptions = {
    enableSpecialToolHandling: false,
    safeOutputTokenLimiting: true
  };

  /**
   * 主转换函数：将Claude请求转换为Gemini请求
   */
  static async transformRequest(
    claudeRequest: ClaudeRequest,
    options?: TransformOptions
  ): Promise<GeminiRequest> {
    const transformOptions = { ...this.defaultOptions, ...options };

    try {
      // 1. 映射模型名称
      const modelMapper = ModelMapper.getInstance();
      const geminiModel = modelMapper.mapModel(claudeRequest.model);

      // 2. 转换消息内容
      const contents = await this.transformMessages(claudeRequest.messages);

      // 3. 转换生成配置
      const generationConfig = this.transformGenerationConfig(claudeRequest, transformOptions);

      // 4. 构建基础请求
      const geminiRequest: GeminiRequest = {
        contents,
        generationConfig
      };

      // 5. 处理系统消息
      if (claudeRequest.system) {
        geminiRequest.systemInstruction = this.transformSystemMessage(claudeRequest.system);
      }

      // 6. 处理工具
      if (claudeRequest.tools && claudeRequest.tools.length > 0) {
        const toolResult = ToolTransformer.convertTools(claudeRequest.tools);
        if (toolResult.tools.length > 0) {
          geminiRequest.tools = toolResult.tools;
        }

        if (claudeRequest.tool_choice) {
          const toolConfig = ToolTransformer.convertToolChoice(claudeRequest.tool_choice, claudeRequest.tools);
          if (toolConfig) {
            geminiRequest.toolConfig = toolConfig;
          }
        }
      }

      return geminiRequest;
    } catch (error) {
      throw new Error(`Request transformation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 转换消息列表
   */
  private static async transformMessages(messages: ClaudeMessage[]): Promise<GeminiContent[]> {
    const contents: GeminiContent[] = [];

    for (const message of messages) {
      const parts = await ContentTransformer.transformContent(message.content);

      // 映射角色
      const role = message.role === 'assistant' ? 'model' : 'user';

      contents.push({
        role,
        parts
      });
    }

    return contents;
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
    options: TransformOptions
  ): GeminiGenerationConfig {
    const modelMapper = ModelMapper.getInstance();
    const maxTokens = options.maxOutputTokens ||
      modelMapper.getRecommendedMaxTokens(claudeRequest.model, claudeRequest.max_tokens);

    const config: GeminiGenerationConfig = {
      maxOutputTokens: maxTokens,
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
}