/**
 * 数据记录器
 * 临时调试方案 - 注释掉initialize()调用即可禁用
 */

interface LogEntry {
  requestId: string;
  timestamp: string;
  model: string;
  isStream: boolean;
  clientRequest?: any;
  geminiData?: any; // 统一字段：非流式时存完整响应，流式时存chunks数组
}

export class Logger {
  private static logs = new Map<string, LogEntry>();
  private static enabled = false; // 默认禁用

  static initialize() {
    this.enabled = true;
    console.log('🟢 Logger enabled - GET /logs to retrieve data');
  }

  static logRequest(requestId: string, model: string, clientRequest: any) {
    if (!this.enabled) return;

    const isStream = clientRequest.stream === true;

    this.logs.set(requestId, {
      requestId,
      timestamp: new Date().toISOString(),
      model,
      isStream,
      clientRequest
    });
    console.log(`📝 Logged ${isStream ? 'stream' : 'regular'} request ${requestId}`);
  }

  static logResponse(requestId: string, geminiResponse: any) {
    if (!this.enabled) return;

    const entry = this.logs.get(requestId);
    if (entry) {
      if (entry.isStream) {
        // 流式请求，初始化chunks数组
        entry.geminiData = [];
      } else {
        // 非流式请求，直接存储响应
        entry.geminiData = geminiResponse;
      }
      this.logs.set(requestId, entry);
      console.log(`📝 Logged ${entry.isStream ? 'stream init' : 'response'} ${requestId}`);
    }
  }

  static logStreamChunk(requestId: string, chunk: any) {
    if (!this.enabled) return;

    const entry = this.logs.get(requestId);
    if (entry && entry.isStream) {
      if (!entry.geminiData) entry.geminiData = [];
      entry.geminiData.push(chunk);
      this.logs.set(requestId, entry);
    }
  }

  static getAllLogs() {
    return Array.from(this.logs.values());
  }

  static getLog(requestId: string) {
    return this.logs.get(requestId);
  }

  static clear() {
    const count = this.logs.size;
    this.logs.clear();
    return count;
  }

  static getStats() {
    return {
      total: this.logs.size,
      memoryUsage: `${Math.round(JSON.stringify(Array.from(this.logs.values())).length / 1024)} KB`
    };
  }
}

// 开发调试模式 - 部署生产时注释掉下面这行即可禁用整个数据记录功能
Logger.initialize();