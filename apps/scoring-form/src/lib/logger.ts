/* eslint-disable no-console -- the app's single logging sink (constitution Principle IV) */

// Context objects must never carry secrets, patient data or study identifiers (Principle III).
type Context = Record<string, unknown>;

export enum LogLevel {
  Debug = 'debug',
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
}

function write(level: LogLevel, message: string, context?: Context): void {
  if (context === undefined) {
    console[level](message);
  } else {
    console[level](message, context);
  }
}

export const logger: Record<LogLevel, (message: string, context?: Context) => void> = {
  [LogLevel.Debug](message, context) {
    // Read at call time, not module load, so tests can stub the build mode.
    if (import.meta.env.PROD) return;
    write(LogLevel.Debug, message, context);
  },
  [LogLevel.Info](message, context) {
    write(LogLevel.Info, message, context);
  },
  [LogLevel.Warn](message, context) {
    write(LogLevel.Warn, message, context);
  },
  [LogLevel.Error](message, context) {
    write(LogLevel.Error, message, context);
  },
};
