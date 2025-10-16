/**
 * 数据记录器
 * 临时调试方案 - 注释掉initialize()调用即可禁用
 *
 * 日志结构符合 scripts/export-logs.js 导出规则
 */

interface GeminiRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: any;
}

interface ResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: any;
  rawBody?: string;
}

interface PerformanceMetrics {
  startTime: number;
  geminiRequestTime?: number;
  geminiResponseTime?: number;
  endTime?: number;
  duration?: number;
  ttfb?: number; // Time to first byte (for streaming)
}

interface LogEntry {
  requestId: string;
  timestamp: string;
  path: string;
  method: string;
  isStream: boolean;
  clientRequest?: {
    headers: Record<string, string>;
    body: any;
  };
  geminiRequest?: GeminiRequest;
  geminiResponse?: ResponseData;
  claudeResponse?: ResponseData;
  performance: PerformanceMetrics;
  error?: {
    message: string;
    code?: string;
    details?: any;
    timestamp: string;
  };
}

export class Logger {
  private static logs = new Map<string, LogEntry>();
  private static enabled = false; // 默认禁用

  static initialize() {
    this.enabled = true;
    console.log('🟢 Logger enabled - GET /logs to retrieve data');
  }

  /**
   * 初始化请求日志
   */
  static logRequest(
    requestId: string,
    path: string,
    method: string,
    headers: Record<string, string>,
    body: any
  ) {
    if (!this.enabled) return;

    const isStream = body?.stream === true;
    const startTime = Date.now();

    this.logs.set(requestId, {
      requestId,
      timestamp: new Date().toISOString(),
      path,
      method,
      isStream,
      clientRequest: {
        headers: this.sanitizeHeaders(headers),
        body
      },
      performance: {
        startTime
      }
    });
    console.log(`📝 [${requestId}] Request logged (${isStream ? 'stream' : 'regular'})`);
  }

  /**
   * 记录 Gemini 请求信息
   */
  static logGeminiRequest(
    requestId: string,
    url: string,
    method: string,
    headers: Record<string, string>,
    body: any
  ) {
    if (!this.enabled) return;

    const entry = this.logs.get(requestId);
    if (entry) {
      entry.geminiRequest = {
        url,
        method,
        headers: this.sanitizeHeaders(headers),
        body
      };
      entry.performance.geminiRequestTime = Date.now();
      this.logs.set(requestId, entry);
      console.log(`📝 [${requestId}] Gemini request logged`);
    }
  }

  /**
   * 记录 Gemini 响应信息
   */
  static logGeminiResponse(
    requestId: string,
    status: number,
    statusText: string,
    headers: Record<string, string>,
    body: any,
    rawBody?: string
  ) {
    if (!this.enabled) return;

    const entry = this.logs.get(requestId);
    if (entry) {
      entry.geminiResponse = {
        status,
        statusText,
        headers: this.sanitizeHeaders(headers),
        body,
        rawBody
      };
      entry.performance.geminiResponseTime = Date.now();
      this.logs.set(requestId, entry);
      console.log(`📝 [${requestId}] Gemini response logged (${status})`);
    }
  }

  /**
   * 记录 Claude 响应信息
   */
  static logClaudeResponse(
    requestId: string,
    body: any,
    rawBody?: string
  ) {
    if (!this.enabled) return;

    const entry = this.logs.get(requestId);
    if (entry) {
      entry.claudeResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body,
        rawBody
      };
      this.logs.set(requestId, entry);
      console.log(`📝 [${requestId}] Claude response logged`);
    }
  }

  /**
   * 记录首字节时间 (TTFB) - 用于流式请求
   */
  static logFirstByte(requestId: string) {
    if (!this.enabled) return;

    const entry = this.logs.get(requestId);
    if (entry && !entry.performance.ttfb) {
      entry.performance.ttfb = Date.now() - entry.performance.startTime;
      this.logs.set(requestId, entry);
      console.log(`📝 [${requestId}] TTFB: ${entry.performance.ttfb}ms`);
    }
  }

  /**
   * 记录错误信息
   */
  static logError(
    requestId: string,
    message: string,
    code?: string,
    details?: any
  ) {
    if (!this.enabled) return;

    const entry = this.logs.get(requestId);
    if (entry) {
      entry.error = {
        message,
        code,
        details,
        timestamp: new Date().toISOString()
      };
      this.logs.set(requestId, entry);
      console.log(`❌ [${requestId}] Error logged: ${message}`);
    }
  }

  /**
   * 完成请求，计算最终性能指标
   */
  static finishRequest(requestId: string) {
    if (!this.enabled) return;

    const entry = this.logs.get(requestId);
    if (entry) {
      entry.performance.endTime = Date.now();
      entry.performance.duration = entry.performance.endTime - entry.performance.startTime;
      this.logs.set(requestId, entry);
      console.log(`✅ [${requestId}] Request finished (${entry.performance.duration}ms)`);
    }
  }

  /**
   * 获取所有日志（支持分页和过滤）
   */
  static getAllLogs(options?: {
    limit?: number;
    offset?: number;
    hasError?: boolean;
    isStream?: boolean;
  }) {
    let logs = Array.from(this.logs.values());

    // 按时间倒序排列（最新的在前）
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // 过滤
    if (options?.hasError !== undefined) {
      logs = logs.filter(log => !!log.error === options.hasError);
    }
    if (options?.isStream !== undefined) {
      logs = logs.filter(log => log.isStream === options.isStream);
    }

    // 分页
    const offset = options?.offset || 0;
    const limit = options?.limit || logs.length;

    return logs.slice(offset, offset + limit);
  }

  /**
   * 获取单个日志
   */
  static getLog(requestId: string) {
    return this.logs.get(requestId);
  }

  /**
   * 清空日志
   */
  static clear() {
    const count = this.logs.size;
    this.logs.clear();
    return count;
  }

  /**
   * 获取统计信息
   */
  static getStats() {
    const logs = Array.from(this.logs.values());
    const memorySize = JSON.stringify(logs).length;

    return {
      totalLogs: this.logs.size,
      streamLogs: logs.filter(log => log.isStream).length,
      errorLogs: logs.filter(log => log.error).length,
      memoryUsage: `${Math.round(memorySize / 1024)} KB`,
      oldestLog: logs.length > 0 ? logs[logs.length - 1].timestamp : null,
      newestLog: logs.length > 0 ? logs[0].timestamp : null
    };
  }

  /**
   * 清理敏感信息（API密钥、授权令牌等）
   */
  private static sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized = { ...headers };

    // 清理敏感字段
    const sensitiveKeys = ['authorization', 'x-api-key', 'api-key', 'cookie'];

    for (const key of Object.keys(sanitized)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
        const value = sanitized[key];
        if (value && value.length > 10) {
          // 只保留前4位和后4位
          sanitized[key] = `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
        } else {
          sanitized[key] = '***';
        }
      }
    }

    return sanitized;
  }
}

// 开发调试模式 - 部署生产时注释掉下面这行即可禁用整个数据记录功能
Logger.initialize();