/**
 * 工具转换器 V2
 * 负责转换Claude和Gemini之间的工具定义和调用
 */

import { ClaudeTool, ClaudeToolChoice } from '../types/claude';
import { GeminiTool, GeminiToolConfig, GeminiFunctionDeclaration } from '../types/gemini';

export interface ToolConversionResult {
  tools: GeminiTool[];
  hasSpecialTools: boolean;
  functionCount: number;
}

export class ToolTransformer {
  /**
   * 转换Claude工具定义为Gemini工具
   */
  static convertTools(claudeTools: ClaudeTool[]): ToolConversionResult {
    const tools: GeminiTool[] = [];
    let functionCount = 0;

    // 检查是否有官方 web_search_20250305 工具
    const hasOfficialWebSearch = claudeTools.some((t: any) => t.type === 'web_search_20250305');

    if (hasOfficialWebSearch) {
      // 如果有官方搜索工具，只返回google_search
      tools.push({ google_search: {} });
      return {
        tools,
        hasSpecialTools: true,
        functionCount: 0
      };
    }

    // Filter out official tool types that we don't yet support in Gemini conversion
    const supportedTools = claudeTools.filter(tool => {
      // Skip official Claude tools that don't have Gemini equivalents
      if (tool.type && [
        'bash_20250124',
        'code_execution_20250124',
        'text_editor_20250429',
        'web_fetch_20250305',
        'computer_use_20250124'
      ].includes(tool.type)) {
        // These tools need special handling or aren't supported yet
        return false;
      }
      return true;
    });

    // 保留所有工具作为函数工具，包括WebSearch
    // 这样客户端可以看到工具调用
    if (supportedTools.length > 0) {
      const functionDeclarations: GeminiFunctionDeclaration[] = supportedTools.map(tool => ({
        name: tool.name,
        description: tool.description || `${tool.name} tool`,
        parameters: this.convertInputSchema(tool.input_schema || { type: 'object', properties: {} })
      }));

      tools.push({
        functionDeclarations
      });

      functionCount = functionDeclarations.length;
    }

    const hasSpecialTools = claudeTools.some(tool =>
      this.isSpecialTool(tool.name) || this.isClaudeOfficialTool(tool)
    );

    return {
      tools,
      hasSpecialTools,
      functionCount
    };
  }

  /**
   * 转换工具选择配置
   */
  static convertToolChoice(
    toolChoice: ClaudeToolChoice,
    tools: ClaudeTool[]
  ): GeminiToolConfig | null {
    if (!toolChoice || !tools || tools.length === 0) {
      return null;
    }

    // 检查是否有官方 web_search_20250305 工具
    const hasOfficialWebSearch = tools.some((t: any) => t.type === 'web_search_20250305');
    if (hasOfficialWebSearch) {
      return null;
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
  static convertInputSchema(claudeSchema: any): any {
    // 深拷贝后进行递归清理，移除 Gemini 不支持/无效字段，规范结构
    const sanitize = (schema: any): any => {
      if (!schema || typeof schema !== 'object') return schema;

      const s: any = Array.isArray(schema) ? schema.map(sanitize) : { ...schema };

      // 移除 $schema、$id、title 等非必须元信息，避免 Unknown name 错误
      delete s.$schema;
      delete s.$id;
      delete s.title;

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

      // additionalProperties：Gemini Function parameters 通常不接受该字段，移除以避免报错
      if ('additionalProperties' in s) {
        delete s.additionalProperties;
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
   * 分类并映射工具
   */
  static categorizeAndMapTools(claudeTools: ClaudeTool[]): {
    regularTools: ClaudeTool[];
    specialToolsMapped: GeminiTool[];
  } {
    const regularTools: ClaudeTool[] = [];
    const specialToolsMapped: GeminiTool[] = [];

    claudeTools.forEach(tool => {
      const toolAny = tool as any;

      // 处理Claude官方web_search_20250305工具
      if (toolAny.type === 'web_search_20250305') {
        // 映射到Gemini的googleSearch工具
        const geminiSearchTool: GeminiTool = {
          google_search: {
            // 保留Claude工具的配置参数
            ...(toolAny.max_uses && { maxUses: toolAny.max_uses }),
            ...(toolAny.allowed_domains && { allowedDomains: toolAny.allowed_domains }),
            ...(toolAny.blocked_domains && { blockedDomains: toolAny.blocked_domains }),
            ...(toolAny.user_location && { userLocation: toolAny.user_location })
          }
        };
        specialToolsMapped.push(geminiSearchTool);
      }
      // 处理Claude官方web_fetch_20250305工具
      else if (toolAny.type === 'web_fetch_20250305') {
        // Gemini的URL Context不需要在tools中声明，直接在content中处理URL
        // 这里不添加到specialToolsMapped，将在内容转换时处理
      }
      // 处理名称匹配的特殊工具  
      else if (this.isSpecialTool(tool.name)) {
        const name = tool.name.toLowerCase();
        if (name === 'websearch' || name === 'web_search') {
          specialToolsMapped.push({ google_search: {} });
        }
        // WebFetch通过URL Context在内容中处理，不需要工具声明
      }
      // 常规工具
      else {
        regularTools.push(tool);
      }
    });

    return {
      regularTools,
      specialToolsMapped
    };
  }

  /**
   * 获取工具的分类信息
   */
  static categorizeTools(tools: ClaudeTool[]): {
    regularTools: ClaudeTool[];
    webSearchTools: ClaudeTool[];
    webFetchTools: ClaudeTool[];
    otherSpecialTools: ClaudeTool[];
  } {
    const regularTools: ClaudeTool[] = [];
    const webSearchTools: ClaudeTool[] = [];
    const webFetchTools: ClaudeTool[] = [];
    const otherSpecialTools: ClaudeTool[] = [];

    tools.forEach(tool => {
      const name = tool.name.toLowerCase();
      if (name === 'websearch' || name === 'web_search') {
        webSearchTools.push(tool);
      } else if (name === 'webfetch' || name === 'web_fetch') {
        webFetchTools.push(tool);
      } else if (this.isSpecialTool(tool.name)) {
        otherSpecialTools.push(tool);
      } else {
        regularTools.push(tool);
      }
    });

    return {
      regularTools,
      webSearchTools,
      webFetchTools,
      otherSpecialTools
    };
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
   * 创建标准工具模板
   */
  static createToolTemplate(
    name: string, 
    description: string, 
    parameters: Record<string, any> = {}
  ): ClaudeTool {
    return {
      name,
      description,
      input_schema: {
        type: 'object',
        properties: parameters,
        required: Object.keys(parameters).filter(key => parameters[key].required !== false)
      }
    };
  }

  /**
   * 获取推荐的工具定义模板
   */
  static getRecommendedTools(): Record<string, ClaudeTool> {
    return {
      calculator: this.createToolTemplate(
        'calculator',
        'Perform basic mathematical calculations',
        {
          expression: {
            type: 'string',
            description: 'Mathematical expression to evaluate (e.g., "2 + 3 * 4")'
          }
        }
      ),
      web_search: this.createToolTemplate(
        'WebSearch',
        'Search the web for current information',
        {
          query: {
            type: 'string',
            description: 'Search query string'
          }
        }
      ),
      web_fetch: this.createToolTemplate(
        'WebFetch',
        'Fetch and analyze content from a specific URL',
        {
          url: {
            type: 'string',
            description: 'URL to fetch content from'
          },
          prompt: {
            type: 'string',
            description: 'Question or instruction for analyzing the content'
          }
        }
      ),
      file_read: this.createToolTemplate(
        'file_read',
        'Read contents of a text file',
        {
          file_path: {
            type: 'string',
            description: 'Path to the file to read'
          }
        }
      ),
      code_execution: this.createToolTemplate(
        'code_execution',
        'Execute code in a specified programming language',
        {
          language: {
            type: 'string',
            enum: ['python', 'javascript', 'bash'],
            description: 'Programming language to execute'
          },
          code: {
            type: 'string',
            description: 'Code to execute'
          }
        }
      )
    };
  }

  /**
   * 获取工具转换统计信息
   */
  static getConversionStats(
    claudeTools: ClaudeTool[], 
    conversionResult: ToolConversionResult
  ): {
    originalCount: number;
    convertedCount: number;
    specialToolCount: number;
    categoryBreakdown: ReturnType<typeof ToolTransformer.categorizeTools>;
    complexityScore: number;
  } {
    const categoryBreakdown = this.categorizeTools(claudeTools);
    
    // 计算复杂度分数（基于参数数量和描述长度）
    let complexityScore = 0;
    claudeTools.forEach(tool => {
      const paramCount = tool.input_schema?.properties ? 
        Object.keys(tool.input_schema.properties).length : 0;
      const descLength = tool.description?.length || 0;
      complexityScore += paramCount * 2 + Math.min(descLength / 50, 10);
    });

    return {
      originalCount: claudeTools.length,
      convertedCount: conversionResult.functionCount,
      specialToolCount: claudeTools.length - categoryBreakdown.regularTools.length,
      categoryBreakdown,
      complexityScore: Math.round(complexityScore)
    };
  }
}