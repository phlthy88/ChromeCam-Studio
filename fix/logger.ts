/**
 * Simple logger utility with namespaced output
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  namespace: string;
  message: string;
  data?: unknown;
  timestamp: number;
}

class Logger {
  private logLevel: LogLevel = 'info';
  private logHistory: LogEntry[] = [];
  private maxHistory = 1000;

  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  setLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.logLevel];
  }

  private formatMessage(namespace: string, message: string): string {
    return `[${namespace}] ${message}`;
  }

  private log(level: LogLevel, namespace: string, message: string, ...data: unknown[]): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      namespace,
      message,
      data: data.length > 0 ? data : undefined,
      timestamp: Date.now()
    };

    this.logHistory.push(entry);
    if (this.logHistory.length > this.maxHistory) {
      this.logHistory.shift();
    }

    const formattedMessage = this.formatMessage(namespace, message);
    const con = console;

    switch (level) {
      case 'warn':
        con.warn(formattedMessage, ...data);
        break;
      case 'error':
        con.error(formattedMessage, ...data);
        break;
    }
  }

  debug(namespace: string, message: string, ...data: unknown[]): void {
    this.log('debug', namespace, message, ...data);
  }

  info(namespace: string, message: string, ...data: unknown[]): void {
    this.log('info', namespace, message, ...data);
  }

  warn(namespace: string, message: string, ...data: unknown[]): void {
    this.log('warn', namespace, message, ...data);
  }

  error(namespace: string, message: string, ...data: unknown[]): void {
    this.log('error', namespace, message, ...data);
  }

  getHistory(): LogEntry[] {
    return [...this.logHistory];
  }

  clearHistory(): void {
    this.logHistory = [];
  }
}

export const logger = new Logger();
export type { LogLevel, LogEntry };
