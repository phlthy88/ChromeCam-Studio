type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: number;
  level: LogLevel;
  component: string;
  message: string;
  data?: unknown;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;

  private log(level: LogLevel, component: string, message: string, data?: unknown) {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      component,
      message,
      data,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Only output in development or for errors/warnings
    if (import.meta.env.DEV || level === 'error' || level === 'warn') {
      const prefix = `[${level.toUpperCase()}][${component}]`;
      if (level === 'error') {
        console.error(prefix, message, data || '');
      } else if (level === 'warn') {
        console.warn(prefix, message, data || '');
      } else {
        console.warn(prefix, message, data || '');
      }
    }
  }

  debug(component: string, message: string, data?: unknown) {
    this.log('debug', component, message, data);
  }

  info(component: string, message: string, data?: unknown) {
    this.log('info', component, message, data);
  }

  warn(component: string, message: string, data?: unknown) {
    this.log('warn', component, message, data);
  }

  error(component: string, message: string, data?: unknown) {
    this.log('error', component, message, data);
  }

  getLogs() {
    return [...this.logs];
  }

  clear() {
    this.logs = [];
  }

  // Export logs for debugging
  export() {
    return JSON.stringify(this.logs, null, 2);
  }
}

export const logger = new Logger();
