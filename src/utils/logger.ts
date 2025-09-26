/**
 * 日志工具类 - 用于调试和追踪
 */

export interface LogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  component: string;
  message: string;
  data?: any;
}

export class Logger {
  private static logs: LogEntry[] = [];
  private static maxLogs = 1000; // 最大保留日志条数
  private static enabled = true;

  /**
   * 记录日志
   */
  private static log(
    level: LogEntry['level'],
    component: string,
    message: string,
    data?: any
  ): void {
    if (!this.enabled) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
      data
    };

    // 添加到内存日志
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift(); // 移除最旧的日志
    }

  }

  /**
   * DEBUG级别日志
   */
  static debug(component: string, message: string, data?: any): void {
    this.log('DEBUG', component, message, data);
  }

  /**
   * INFO级别日志
   */
  static info(component: string, message: string, data?: any): void {
    this.log('INFO', component, message, data);
  }

  /**
   * WARN级别日志
   */
  static warn(component: string, message: string, data?: any): void {
    this.log('WARN', component, message, data);
  }

  /**
   * ERROR级别日志
   */
  static error(component: string, message: string, data?: any): void {
    this.log('ERROR', component, message, data);
  }

  /**
   * 获取所有日志
   */
  static getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * 获取格式化的日志文本
   */
  static getLogsAsText(): string {
    return this.logs.map(entry => {
      let log = `[${entry.timestamp}] [${entry.level}] [${entry.component}] ${entry.message}`;
      if (entry.data) {
        log += '\n' + JSON.stringify(entry.data, null, 2);
      }
      return log;
    }).join('\n');
  }

  /**
   * 清空日志
   */
  static clear(): void {
    this.logs = [];
  }

  /**
   * 启用/禁用日志
   */
  static setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}