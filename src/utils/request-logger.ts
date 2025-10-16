/**
 * Request Logger - 详细记录请求/响应数据用于调试和分析
 * 由于 Cloudflare Workers 环境限制，使用内存缓存
 */

export interface RequestLog {
  // 基本信息
  requestId: string;
  timestamp: string;
  path: string;
  method: string;
  isStream: boolean;

  // 客户端原始请求
  clientRequest: {
    headers: Record<string, string>;
    body: any; // 未处理的原始请求体
  };

  // 转换后的 Gemini 请求
  geminiRequest: {
    url: string;
    method: string;
    body: any; // 转换后的请求体
  };

  // Gemini 原始响应
  geminiResponse: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: any; // 原始响应体（非流式）或流式数据块数组
    rawBody?: string; // 原始响应字符串（用于调试）
  };

  // 转换后的 Claude 响应
  claudeResponse: {
    status: number;
    body: any; // 转换后的响应体（非流式）或流式事件数组
    rawBody?: string; // 原始响应字符串（用于调试）
  };

  // 性能指标
  performance: {
    startTime: number;
    geminiRequestTime?: number;
    geminiResponseTime?: number;
    endTime?: number;
    duration?: number;
  };

  // 错误信息（如果有）
  error?: {
    message: string;
    stack?: string;
    stage: 'client_request' | 'transformation' | 'gemini_request' | 'gemini_response' | 'claude_response';
  };
}

/**
 * 日志缓存管理器
 */
class RequestLoggerCache {
  private logs: Map<string, RequestLog> = new Map();
  private maxSize: number = 100; // 最多保存100条日志
  private maxAge: number = 30 * 60 * 1000; // 30分钟过期

  /**
   * 创建新的请求日志
   */
  createLog(requestId: string, path: string, method: string): RequestLog {
    const log: RequestLog = {
      requestId,
      timestamp: new Date().toISOString(),
      path,
      method,
      isStream: false,
      clientRequest: {
        headers: {},
        body: null,
      },
      geminiRequest: {
        url: '',
        method: '',
        body: null,
      },
      geminiResponse: {
        status: 0,
        statusText: '',
        headers: {},
        body: null,
      },
      claudeResponse: {
        status: 0,
        body: null,
      },
      performance: {
        startTime: Date.now(),
      },
    };

    this.logs.set(requestId, log);
    this.cleanup();
    return log;
  }

  /**
   * 获取日志
   */
  getLog(requestId: string): RequestLog | undefined {
    return this.logs.get(requestId);
  }

  /**
   * 更新日志
   */
  updateLog(requestId: string, updates: Partial<RequestLog>): void {
    const log = this.logs.get(requestId);
    if (log) {
      Object.assign(log, updates);
    }
  }

  /**
   * 获取所有日志
   */
  getAllLogs(): RequestLog[] {
    return Array.from(this.logs.values()).sort(
      (a, b) => b.performance.startTime - a.performance.startTime
    );
  }

  /**
   * 按请求ID获取日志
   */
  getLogsByIds(ids: string[]): RequestLog[] {
    return ids
      .map((id) => this.logs.get(id))
      .filter((log): log is RequestLog => log !== undefined);
  }

  /**
   * 清理过期日志
   */
  private cleanup(): void {
    const now = Date.now();
    const logsArray = Array.from(this.logs.entries());

    // 删除过期日志
    for (const [id, log] of logsArray) {
      if (now - log.performance.startTime > this.maxAge) {
        this.logs.delete(id);
      }
    }

    // 如果超过最大数量，删除最旧的
    if (this.logs.size > this.maxSize) {
      const sorted = logsArray.sort(
        (a, b) => a[1].performance.startTime - b[1].performance.startTime
      );
      const toDelete = sorted.slice(0, this.logs.size - this.maxSize);
      for (const [id] of toDelete) {
        this.logs.delete(id);
      }
    }
  }

  /**
   * 清空所有日志
   */
  clear(): void {
    this.logs.clear();
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const logs = this.getAllLogs();
    return {
      totalLogs: logs.length,
      streamLogs: logs.filter((l) => l.isStream).length,
      errorLogs: logs.filter((l) => l.error).length,
      oldestTimestamp: logs.length > 0 ? logs[logs.length - 1].timestamp : null,
      newestTimestamp: logs.length > 0 ? logs[0].timestamp : null,
    };
  }
}

// 全局单例
export const requestLogger = new RequestLoggerCache();

/**
 * 辅助函数：记录客户端请求
 */
export function logClientRequest(
  requestId: string,
  headers: Headers,
  body: any
): void {
  try {
    const log = requestLogger.getLog(requestId);
    if (log) {
      const headerObj: Record<string, string> = {};
      headers.forEach((value, key) => {
        // 脱敏处理 API Key
        if (key.toLowerCase() === 'x-api-key') {
          headerObj[key] = value.substring(0, 10) + '...' + value.substring(value.length - 4);
        } else {
          headerObj[key] = value;
        }
      });

      const isStream = body.stream === true;

      requestLogger.updateLog(requestId, {
        clientRequest: {
          headers: headerObj,
          body: JSON.parse(JSON.stringify(body)),
        },
        isStream,
        geminiResponse: {
          ...log.geminiResponse,
          body: isStream ? [] : null,
        },
        claudeResponse: {
          ...log.claudeResponse,
          body: isStream ? [] : null,
        },
      });
    }
  } catch (error) {
    console.error('[RequestLogger] logClientRequest failed:', { requestId, error });
  }
}

/**
 * 辅助函数：记录 Gemini 请求
 */
export function logGeminiRequest(
  requestId: string,
  url: string,
  method: string,
  body: any
): void {
  try {
    const log = requestLogger.getLog(requestId);
    if (log) {
      requestLogger.updateLog(requestId, {
        geminiRequest: {
          url,
          method,
          body: JSON.parse(JSON.stringify(body)), // 深拷贝
        },
        performance: {
          ...log.performance,
          geminiRequestTime: Date.now(),
        },
      });
    }
  } catch (error) {
    console.error('[RequestLogger] logGeminiRequest failed:', { requestId, error });
  }
}

/**
 * 辅助函数：记录 Gemini 响应
 */
export function logGeminiResponse(
  requestId: string,
  status: number,
  statusText: string,
  headers: Headers,
  body: any,
  rawBody?: string
): void {
  const log = requestLogger.getLog(requestId);
  if (log) {
    const headerObj: Record<string, string> = {};
    headers.forEach((value, key) => {
      headerObj[key] = value;
    });

    requestLogger.updateLog(requestId, {
      geminiResponse: {
        status,
        statusText,
        headers: headerObj,
        body: log.isStream ? [] : JSON.parse(JSON.stringify(body)),
        rawBody, // 保存原始响应字符串
      },
      performance: {
        ...log.performance,
        geminiResponseTime: Date.now(),
      },
    });
  }
}

/**
 * 辅助函数：记录 Gemini 流式数据块
 */
export function logGeminiStreamChunk(requestId: string, chunk: any): void {
  const log = requestLogger.getLog(requestId);
  if (log && log.isStream && Array.isArray(log.geminiResponse.body)) {
    log.geminiResponse.body.push({
      timestamp: Date.now(),
      data: JSON.parse(JSON.stringify(chunk)),
    });
  }
}

/**
 * 辅助函数：记录 Claude 响应
 */
export function logClaudeResponse(requestId: string, status: number, body: any, rawBody?: string): void {
  const log = requestLogger.getLog(requestId);
  if (log) {
    requestLogger.updateLog(requestId, {
      claudeResponse: {
        status,
        body: log.isStream ? [] : JSON.parse(JSON.stringify(body)),
        rawBody, // 保存原始响应字符串
      },
      performance: {
        ...log.performance,
        endTime: Date.now(),
        duration: Date.now() - log.performance.startTime,
      },
    });
  }
}

/**
 * 辅助函数：记录 Claude 流式事件
 */
export function logClaudeStreamEvent(requestId: string, event: any): void {
  const log = requestLogger.getLog(requestId);
  if (log && log.isStream && Array.isArray(log.claudeResponse.body)) {
    log.claudeResponse.body.push({
      timestamp: Date.now(),
      event: JSON.parse(JSON.stringify(event)),
    });
  }
}

/**
 * 辅助函数：记录错误
 */
export function logError(
  requestId: string,
  error: Error,
  stage: 'client_request' | 'transformation' | 'gemini_request' | 'gemini_response' | 'claude_response'
): void {
  const log = requestLogger.getLog(requestId);
  if (log) {
    requestLogger.updateLog(requestId, {
      error: {
        message: error.message,
        stack: error.stack,
        stage,
      },
      performance: {
        ...log.performance,
        endTime: Date.now(),
        duration: Date.now() - log.performance.startTime,
      },
    });
  }
}
