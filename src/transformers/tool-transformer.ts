/**
 * 工具转换器
 * 基于官方文档实现Claude和Gemini之间的正确工具转换
 * 官方文档：
 * - Claude: https://docs.claude.com/zh-CN/docs/agents-and-tools/tool-use/implement-tool-use
 * - Gemini: https://ai.google.dev/gemini-api/docs/function-calling
 */

import { ClaudeTool, ClaudeToolChoice } from '../types/claude';
import { GeminiTool, GeminiToolConfig, GeminiFunctionDeclaration } from '../types/gemini';

export interface ToolConversionResult {
  tools: GeminiTool[];
  hasSpecialTools: boolean;
  functionCount: number;
  hasOfficialTools: boolean;
  errors: string[];
}

export class ToolTransformer {
  /**
   * 根据官方文档转换Claude工具定义为Gemini工具
   *
   * Claude工具要求：
   * - 详细的name（匹配^[a-zA-Z0-9_-]{1,64}$）
   * - 极其详细的description
   * - 精确的JSON Schema参数
   *
   * Gemini工具要求：
   * - 清晰的函数名称
   * - 详细的功能描述
   * - 强类型参数定义
   */
  static convertTools(claudeTools: ClaudeTool[]): ToolConversionResult {
    const tools: GeminiTool[] = [];
    const errors: string[] = [];
    let functionCount = 0;
    let hasOfficialTools = false;
    let hasSpecialTools = false;

    // 检查是否有官方 web_search_20250305 工具
    const hasOfficialWebSearch = claudeTools.some((t: any) => t.type === 'web_search_20250305');

    if (hasOfficialWebSearch) {
      // 如果有官方搜索工具，只返回google_search
      tools.push({ google_search: {} });
      return {
        tools,
        hasSpecialTools: true,
        hasOfficialTools: true,
        functionCount: 0,
        errors
      };
    }

    // 转换所有工具，包括Claude官方工具
    const convertedTools = claudeTools.map(tool => {
      // 对于Claude官方工具，转换为适合的格式
      if (tool.type && [
        'bash_20250124',
        'code_execution_20250124',
        'text_editor_20250429',
        'web_fetch_20250305',
        'computer_use_20250124'
      ].includes(tool.type)) {
        return {
          name: tool.type,  // 使用type作为name
          description: tool.description || `${tool.type} - Claude official tool`,
          input_schema: tool.input_schema || { type: 'object', properties: {} }
        };
      }
      // 自定义工具保持原样
      return tool;
    });

    // 将转换后的工具添加为函数声明
    if (convertedTools.length > 0) {
      const functionDeclarations: GeminiFunctionDeclaration[] = convertedTools.map(tool => ({
        name: tool.name,
        description: this.simplifyToolDescription(tool.description || `${tool.name} tool`, tool.name),
        parameters: this.convertInputSchema(tool.input_schema || { type: 'object', properties: {} }, tool.name)
      }));

      tools.push({
        functionDeclarations
      });

      functionCount = functionDeclarations.length;
    }

    const isSpecialTool = claudeTools.some(tool =>
      this.isSpecialTool(tool.name) || this.isClaudeOfficialTool(tool)
    );

    return {
      tools,
      hasSpecialTools: isSpecialTool,
      functionCount,
      hasOfficialTools: false,
      errors: []
    };
  }

  /**
   * 转换工具选择配置
   */
  static convertToolChoice(
    toolChoice: ClaudeToolChoice | undefined,
    tools: ClaudeTool[]
  ): GeminiToolConfig | null {
    if (!tools || tools.length === 0) {
      return null;
    }

    // 检查是否有官方 web_search_20250305 工具
    const hasOfficialWebSearch = tools.some((t: any) => t.type === 'web_search_20250305');
    if (hasOfficialWebSearch) {
      return null;
    }

    // 如果没有指定toolChoice,默认使用AUTO模式以启用函数调用
    if (!toolChoice) {
      return {
        functionCallingConfig: {
          mode: 'AUTO'
        }
      };
    }

    if (typeof toolChoice === 'string') {
      switch (toolChoice) {
        case 'auto':
          return {
            functionCallingConfig: {
              mode: 'AUTO'
            }
          };
        case 'none':
          return {
            functionCallingConfig: {
              mode: 'NONE'
            }
          };
        default:
          return null;
      }
    } else if (typeof toolChoice === 'object' && toolChoice.type === 'tool' && toolChoice.name) {
      // 检查工具是否存在
      const toolExists = tools.some(tool => tool.name === toolChoice.name);
      if (!toolExists) {
        throw new Error(`Tool "${toolChoice.name}" not found in tools array`);
      }

      return {
        functionCallingConfig: {
          mode: 'ANY',
          allowedFunctionNames: [toolChoice.name]
        }
      };
    }

    return null;
  }

  /**
   * 转换输入schema
   */
  static convertInputSchema(claudeSchema: any, toolName?: string): any {
    // 深拷贝后进行递归清理，移除 Gemini 不支持/无效字段，规范结构
    const sanitize = (schema: any): any => {
      if (!schema || typeof schema !== 'object') return schema;

      const s: any = Array.isArray(schema) ? schema.map(sanitize) : { ...schema };

      // 修正：根据官方文档，保留Gemini支持的字段，只移除真正不支持的
      const fieldsToRemove = [
        '$schema', '$id', 'title', 'additionalProperties',
        'examples', 'default', 'format', 'pattern',
        // 'minLength', 'maxLength', 'minimum', 'maximum',
        'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'
        // 注意：enum, const 实际上是被Gemini支持的，不应该移除
      ];

      fieldsToRemove.forEach(field => delete s[field]);

      // 规范 type
      if (!s.type) {
        s.type = s.properties || s.required ? 'object' : s.items ? 'array' : 'string';
      }

      // 规范 properties：必须为对象
      if (s.properties !== undefined) {
        if (typeof s.properties !== 'object' || Array.isArray(s.properties)) {
          s.properties = {};
        } else {
          const newProps: Record<string, any> = {};
          Object.entries(s.properties).forEach(([key, val]) => {
            // 某些上游可能把 properties 作为数组传入，跳过非字符串键
            if (typeof key === 'string' && key.trim()) {
              newProps[key] = sanitize(val);
            }
          });
          s.properties = newProps;
        }
      }

      // 规范 items：允许对象或数组（tuple），递归清理
      if (s.items !== undefined) {
        s.items = sanitize(s.items);
      }

      // 规范 required：必须是字符串数组，且出现在 properties 中
      if (s.required) {
        if (!Array.isArray(s.required)) {
          delete s.required;
        } else if (s.properties && typeof s.properties === 'object') {
          const propKeys = Object.keys(s.properties);
          s.required = s.required.filter((r: any) => typeof r === 'string' && propKeys.includes(r));
          if (s.required.length === 0) delete s.required;
        }
      }

      // 递归清理 anyOf/allOf/oneOf（Gemini 常不支持复杂联合），保守降级为第一个分支
      ['anyOf', 'oneOf', 'allOf'].forEach((k) => {
        if (Array.isArray(s[k]) && s[k].length > 0) {
          const first = sanitize(s[k][0]);
          // 尝试合并到当前 schema 的浅层结构
          delete s[k];
          Object.assign(s, first);
        } else {
          delete s[k];
        }
      });

      return s;
    };

    try {
      const geminiSchema = sanitize(claudeSchema);

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
    } catch (error) {
      // Schema处理出错时，返回最基本的schema
      console.warn('[ToolTransformer] Schema sanitization error:', error);
      return {
        type: 'object',
        properties: {}
      };
    }
  }

  /**
   * 检查是否为特殊工具
   */
  static isSpecialTool(toolName: string): boolean {
    const specialTools = ['WebSearch', 'WebFetch', 'web_search', 'web_fetch', 'websearch', 'webfetch'];
    return specialTools.includes(toolName);
  }

  /**
   * 检查是否为Claude官方工具类型
   */
  static isClaudeOfficialTool(tool: any): boolean {
    return tool.type && [
      'web_search_20250305',
      'web_fetch_20250305',
      'bash_20250124',
      'code_execution_20250124',
      'text_editor_20250429',
      'computer_use_20250124'
    ].includes(tool.type);
  }

  /**
   * 验证工具定义
   */
  static validateTools(tools: ClaudeTool[]): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const toolNames = new Set<string>();

    tools.forEach((tool, index) => {
      const prefix = `Tool ${index} (${tool.name || 'unnamed'})`;

      // 验证必需字段
      if (!tool.name) {
        errors.push(`${prefix}: Missing name field`);
      } else {
        if (toolNames.has(tool.name)) {
          errors.push(`${prefix}: Duplicate tool name "${tool.name}"`);
        }
        toolNames.add(tool.name);

        // 验证工具名称格式
        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(tool.name)) {
          errors.push(`${prefix}: Invalid tool name format. Must start with letter and contain only letters, numbers, and underscores`);
        }
      }

      if (!tool.description) {
        errors.push(`${prefix}: Missing description field`);
      } else if (tool.description.length < 10) {
        warnings.push(`${prefix}: Description is very short (${tool.description.length} chars)`);
      } else if (tool.description.length > 500) {
        warnings.push(`${prefix}: Description is very long (${tool.description.length} chars)`);
      }

      if (!tool.input_schema) {
        errors.push(`${prefix}: Missing input_schema field`);
      } else {
        // 验证schema格式
        const schemaValidation = this.validateInputSchema(tool.input_schema, prefix);
        errors.push(...schemaValidation.errors);
        warnings.push(...schemaValidation.warnings);
      }

      // 检查特殊工具
      if (this.isSpecialTool(tool.name)) {
        warnings.push(`${prefix}: Special tool detected. Will be handled differently in conversion`);
      }
    });

    // 检查工具数量
    if (tools.length > 20) {
      warnings.push(`Large number of tools (${tools.length}). Consider reducing for better performance`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 验证输入schema
   */
  private static validateInputSchema(schema: any, prefix: string): {
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof schema !== 'object') {
      errors.push(`${prefix}: input_schema must be an object`);
      return { errors, warnings };
    }

    // 检查基本字段
    if (!schema.type) {
      warnings.push(`${prefix}: input_schema missing type field`);
    } else if (schema.type !== 'object') {
      warnings.push(`${prefix}: input_schema type should typically be 'object'`);
    }

    if (!schema.properties) {
      warnings.push(`${prefix}: input_schema missing properties field`);
    } else if (typeof schema.properties !== 'object') {
      errors.push(`${prefix}: input_schema properties must be an object`);
    }

    // 检查required字段
    if (schema.required) {
      if (!Array.isArray(schema.required)) {
        errors.push(`${prefix}: input_schema required field must be an array`);
      } else if (schema.properties) {
        // 检查required字段是否都在properties中
        const propertyKeys = Object.keys(schema.properties);
        const invalidRequired = schema.required.filter((req: string) => !propertyKeys.includes(req));
        if (invalidRequired.length > 0) {
          errors.push(`${prefix}: Required fields not in properties: ${invalidRequired.join(', ')}`);
        }
      }
    }

    return { errors, warnings };
  }

  /**
   * 简化工具描述 - 针对 TodoWrite 在推理模式下的问题
   * 移除冗长的示例，保留核心说明
   */
  static simplifyToolDescription(description: string, toolName: string): string {
    // 只针对 TodoWrite 进行简化
    // if (toolName !== 'TodoWrite') {
    //   return description;
    // }
    if (description.includes('<example>')) {
      // 移除所有示例块
      const withoutExamples = description.replace(/<example>[\s\S]*?<\/example>/g, '');
      // 移除推理块
      const withoutReasoning = withoutExamples.replace(/<reasoning>[\s\S]*?<\/reasoning>/g, '');
      // 移除多余空行
      return withoutReasoning.replace(/\n{3,}/g, '\n\n').trim();
    }

    return description;
 
  }

}