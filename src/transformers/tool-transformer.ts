/**
 * 工具转换器 - Cloudflare Workers版本
 * 处理Claude工具到Gemini函数的转换
 */

import { ClaudeTool } from '../types/claude';
import {
  GeminiTool,
  GeminiFunctionDeclaration,
  GeminiToolConfig
} from '../types/gemini';

export interface ToolConversionResult {
  tools: GeminiTool[];
  hasSpecialTools: boolean;
  specialTools: string[];
}

export class ToolTransformer {
  /**
   * 转换Claude工具到Gemini格式
   */
  static convertTools(claudeTools: ClaudeTool[]): ToolConversionResult {
    const functionDeclarations: GeminiFunctionDeclaration[] = [];
    const specialTools: string[] = [];
    let hasSpecialTools = false;

    for (const tool of claudeTools) {
      // 检查是否为特殊工具
      if (this.isSpecialTool(tool.name)) {
        hasSpecialTools = true;
        specialTools.push(tool.name);
      }

      // 转换为Gemini函数声明
      const functionDecl = this.convertToolToFunction(tool);
      if (functionDecl) {
        functionDeclarations.push(functionDecl);
      }
    }

    const tools: GeminiTool[] = [];
    if (functionDeclarations.length > 0) {
      tools.push({ functionDeclarations });
    }

    return {
      tools,
      hasSpecialTools,
      specialTools
    };
  }

  /**
   * 转换单个工具到函数声明
   */
  private static convertToolToFunction(tool: ClaudeTool): GeminiFunctionDeclaration | null {
    try {
      const functionDecl: GeminiFunctionDeclaration = {
        name: tool.name,
        description: tool.description || `Function ${tool.name}`
      };

      // 转换参数schema
      if (tool.input_schema) {
        functionDecl.parameters = this.convertParameterSchema(tool.input_schema);
      }

      return functionDecl;
    } catch (error) {
      console.error(`Failed to convert tool ${tool.name}:`, error);
      return null;
    }
  }

  /**
   * 转换参数schema - 使用原版的完整逻辑
   */
  private static convertParameterSchema(schema: any): any {
    // 深拷贝后进行递归清理，移除 Gemini 不支持/无效字段，规范结构
    const sanitize = (s: any): any => {
      if (!s || typeof s !== 'object') return s;

      const result: any = Array.isArray(s) ? s.map(sanitize) : { ...s };

      // 移除 $schema、$id、title 等非必须元信息，避免 Unknown name 错误
      delete result.$schema;
      delete result.$id;
      delete result.title;

      // 规范 type
      if (!result.type) {
        result.type = result.properties || result.required ? 'object' : result.items ? 'array' : 'string';
      }

      // 规范 properties：必须为对象
      if (result.properties !== undefined) {
        if (typeof result.properties !== 'object' || Array.isArray(result.properties)) {
          result.properties = {};
        } else {
          const newProps: Record<string, any> = {};
          Object.entries(result.properties).forEach(([key, val]) => {
            // 某些上游可能把 properties 作为数组传入，跳过非字符串键
            if (typeof key === 'string' && key.trim()) {
              newProps[key] = sanitize(val);
            }
          });
          result.properties = newProps;
        }
      }

      // 规范 items：允许对象或数组（tuple），递归清理
      if (result.items !== undefined) {
        result.items = sanitize(result.items);
      }

      // 规范 required：必须是字符串数组，且出现在 properties 中
      if (result.required) {
        if (!Array.isArray(result.required)) {
          delete result.required;
        } else if (result.properties && typeof result.properties === 'object') {
          const propKeys = Object.keys(result.properties);
          result.required = result.required.filter((r: any) => typeof r === 'string' && propKeys.includes(r));
          if (result.required.length === 0) delete result.required;
        }
      }

      // additionalProperties：Gemini Function parameters 通常不接受该字段，移除以避免报错
      if ('additionalProperties' in result) {
        delete result.additionalProperties;
      }

      // 递归清理 anyOf/allOf/oneOf（Gemini 常不支持复杂联合），保守降级为第一个分支
      ['anyOf', 'oneOf', 'allOf'].forEach((k) => {
        if (Array.isArray(result[k]) && result[k].length > 0) {
          const first = sanitize(result[k][0]);
          // 尝试合并到当前 schema 的浅层结构
          delete result[k];
          Object.assign(result, first);
        } else {
          delete result[k];
        }
      });

      return result;
    };

    const geminiSchema = sanitize(schema);

    // 顶层兜底：若不是 object，则包一层 object/parameters
    if (geminiSchema.type !== 'object') {
      return {
        type: 'object',
        properties: {
          value: geminiSchema
        }
      };
    }

    // 确保存在 properties
    if (!geminiSchema.properties) {
      geminiSchema.properties = {};
    }

    return geminiSchema;
  }

  /**
   * 检查是否为特殊工具
   */
  private static isSpecialTool(name: string): boolean {
    const specialTools = ['WebSearch', 'WebFetch', 'CodeInterpreter'];
    return specialTools.includes(name);
  }

  /**
   * 转换工具选择配置
   */
  static convertToolChoice(
    toolChoice: any,
    tools: ClaudeTool[]
  ): GeminiToolConfig | null {
    if (!toolChoice) {
      return null;
    }

    const config: GeminiToolConfig = {};

    if (toolChoice.type === 'auto') {
      config.functionCallingConfig = { mode: 'AUTO' };
    } else if (toolChoice.type === 'any') {
      config.functionCallingConfig = { mode: 'ANY' };
    } else if (toolChoice.type === 'tool' && toolChoice.name) {
      config.functionCallingConfig = {
        mode: 'ANY',
        allowedFunctionNames: [toolChoice.name]
      };
    }

    return config;
  }

  /**
   * 转换Gemini函数调用回Claude工具使用格式
   */
  static convertFunctionCallToToolUse(functionCall: any): any {
    return {
      type: 'tool_use',
      id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: functionCall.name,
      input: functionCall.args || {}
    };
  }

  /**
   * 转换Claude工具使用到Gemini函数响应
   */
  static convertToolUseToFunctionResponse(toolUse: any, result: any): any {
    return {
      functionResponse: {
        name: toolUse.name,
        response: result
      }
    };
  }
}