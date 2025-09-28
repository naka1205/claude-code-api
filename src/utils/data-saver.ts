/**
 * 数据保存工具 - 保存客户端请求/响应和Gemini接口数据
 */

import { generateRequestId } from './common';

export interface RequestData {
  requestId: string;
  timestamp: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: any;
  model?: string;
}

export interface ResponseData {
  requestId: string;
  timestamp: string;
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  isStream?: boolean;
  model?: string;
  duration?: number;
}

export interface SavedData {
  claude?: {
    request?: RequestData;
    response?: ResponseData;
  };
  gemini?: {
    request?: RequestData;
    response?: ResponseData;
  };
}

/**
 * 数据保存管理器
 */
export class DataSaver {
  private static data: Map<string, SavedData> = new Map();
  private static readonly MAX_ENTRIES = 1000;
  private static readonly DATA_DIR = './data';

  /**
   * 初始化数据目录
   */
  private static initDataDir(): void {
    try {
      // 动态导入fs模块（仅在开发环境可用）
      const fs = require('fs');
      if (!fs.existsSync(this.DATA_DIR)) {
        fs.mkdirSync(this.DATA_DIR, { recursive: true });
      }
    } catch (error) {
      // 忽略错误（在Workers环境中fs不可用）
    }
  }

  /**
   * 保存客户端请求数据
   */
  static saveClaudeRequest(requestId: string, data: Omit<RequestData, 'requestId' | 'timestamp'>): void {
    const requestData: RequestData = {
      requestId,
      timestamp: new Date().toISOString(),
      ...data
    };

    const savedData = this.data.get(requestId) || {};
    savedData.claude = savedData.claude || {};
    savedData.claude.request = requestData;
    this.data.set(requestId, savedData);

    this.cleanupOldEntries();
    this.saveToFile(requestId, 'claude_request', requestData);
  }

  /**
   * 保存客户端响应数据
   */
  static saveClaudeResponse(requestId: string, data: Omit<ResponseData, 'requestId' | 'timestamp'>): void {
    const responseData: ResponseData = {
      requestId,
      timestamp: new Date().toISOString(),
      ...data
    };

    const savedData = this.data.get(requestId) || {};
    savedData.claude = savedData.claude || {};
    savedData.claude.response = responseData;
    this.data.set(requestId, savedData);

    this.saveToFile(requestId, 'claude_response', responseData);
  }

  /**
   * 保存Gemini接口请求数据
   */
  static saveGeminiRequest(requestId: string, data: Omit<RequestData, 'requestId' | 'timestamp'>): void {
    const requestData: RequestData = {
      requestId,
      timestamp: new Date().toISOString(),
      ...data
    };

    const savedData = this.data.get(requestId) || {};
    savedData.gemini = savedData.gemini || {};
    savedData.gemini.request = requestData;
    this.data.set(requestId, savedData);

    this.saveToFile(requestId, 'gemini_request', requestData);
  }

  /**
   * 保存Gemini接口响应数据
   */
  static saveGeminiResponse(requestId: string, data: Omit<ResponseData, 'requestId' | 'timestamp'>): void {
    const responseData: ResponseData = {
      requestId,
      timestamp: new Date().toISOString(),
      ...data
    };

    const savedData = this.data.get(requestId) || {};
    savedData.gemini = savedData.gemini || {};
    savedData.gemini.response = responseData;
    this.data.set(requestId, savedData);

    this.saveToFile(requestId, 'gemini_response', responseData);
  }

  /**
   * 更新流式响应数据（累计到同一文件）
   */
  static appendStreamResponse(requestId: string, type: 'claude' | 'gemini', chunk: any): void {
    const savedData = this.data.get(requestId);
    if (!savedData) return;

    const responseData = type === 'claude' ? savedData.claude?.response : savedData.gemini?.response;
    if (!responseData) return;

    // 如果是流式响应，累计数据到body中
    if (responseData.isStream) {
      if (!responseData.body.chunks) {
        responseData.body.chunks = [];
      }
      responseData.body.chunks.push({
        timestamp: new Date().toISOString(),
        data: chunk
      });

      // 重新保存到文件
      const fileType = type === 'claude' ? 'claude_response' : 'gemini_response';
      this.saveToFile(requestId, fileType, responseData);
    }
  }

  /**
   * 获取请求的完整数据
   */
  static getRequestData(requestId: string): SavedData | undefined {
    return this.data.get(requestId);
  }

  /**
   * 获取所有保存的数据
   */
  static getAllData(): Map<string, SavedData> {
    return new Map(this.data);
  }

  /**
   * 清理旧数据
   */
  private static cleanupOldEntries(): void {
    if (this.data.size > this.MAX_ENTRIES) {
      const entries = Array.from(this.data.entries());
      const entriesToDelete = entries.slice(0, entries.length - this.MAX_ENTRIES);

      for (const [key] of entriesToDelete) {
        this.data.delete(key);
      }
    }
  }

  /**
   * 保存数据到文件
   */
  private static saveToFile(requestId: string, type: string, data: any): void {
    try {
      this.initDataDir();

      // 动态导入模块（仅在开发环境可用）
      const fs = require('fs');
      const path = require('path');

      const fileName = `${requestId}_${type}.json`;
      const filePath = path.join(this.DATA_DIR, fileName);

      const fileContent = {
        requestId,
        type,
        timestamp: new Date().toISOString(),
        data: data
      };

      // 直接保存到文件系统
      fs.writeFileSync(filePath, JSON.stringify(fileContent, null, 2), 'utf8');

      // 同时保存到内存（用于调试端点）
      if (!(globalThis as any)._debugFiles) {
        (globalThis as any)._debugFiles = new Map();
      }
      (globalThis as any)._debugFiles.set(`${requestId}_${type}`, fileContent);

    } catch (error) {
      // 静默处理保存错误（在Workers环境中fs不可用）
    }
  }

  /**
   * 获取调试文件内容（用于开发调试）
   */
  static getDebugFiles(): Map<string, any> {
    return (globalThis as any)._debugFiles || new Map();
  }

  /**
   * 清空所有数据
   */
  static clear(): void {
    this.data.clear();
    if ((globalThis as any)._debugFiles) {
      (globalThis as any)._debugFiles.clear();
    }
  }
}