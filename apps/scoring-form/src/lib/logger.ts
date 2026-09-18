/* eslint-disable no-console -- the app's single logging sink (constitution Principle IV) */

// Leveled, structured logging. Context objects must never carry secrets,
// patient data or study identifiers (constitution Principle III).
type Context = Record<string, unknown>;
type Level = 'debug' | 'info' | 'warn' | 'error';

function write(level: Level, message: string, context?: Context): void {
  if (context === undefined) {
    console[level](message);
  } else {
    console[level](message, context);
  }
}

export const logger = {
  debug(message: string, context?: Context): void {
    // Read at call time, not module load, so tests can stub the build mode.
    if (import.meta.env.PROD) return;
    write('debug', message, context);
  },
  info(message: string, context?: Context): void {
    write('info', message, context);
  },
  warn(message: string, context?: Context): void {
    write('warn', message, context);
  },
  error(message: string, context?: Context): void {
    write('error', message, context);
  },
};
