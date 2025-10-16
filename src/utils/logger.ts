/**
 * Structured logging utility
 */

import { LOG_LEVELS } from './constants';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  model?: string;
  streaming?: boolean;
  [key: string]: any;
}

export class Logger {
  private enableLogging: boolean;
  private minLevel: LogLevel;

  constructor(enableLogging: boolean = true, minLevel: LogLevel = 'info') {
    this.enableLogging = enableLogging;
    this.minLevel = minLevel;
  }

  /**
   * Check if log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    if (!this.enableLogging) return false;

    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.minLevel);
    const messageLevelIndex = levels.indexOf(level);

    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * Format log message
   */
  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
  }

  /**
   * Debug log
   */
  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message, context));
    }
  }

  /**
   * Info log
   */
  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, context));
    }
  }

  /**
   * Warning log
   */
  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, context));
    }
  }

  /**
   * Error log
   */
  error(message: string, error?: any, context?: LogContext): void {
    if (this.shouldLog('error')) {
      const errorContext = {
        ...context,
        error: error?.message || error,
        stack: error?.stack,
      };
      console.error(this.formatMessage('error', message, errorContext));
    }
  }

  /**
   * Set minimum log level
   */
  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Enable/disable logging
   */
  setEnabled(enabled: boolean): void {
    this.enableLogging = enabled;
  }
}

// Default logger instance
export const logger = new Logger();
