import { afterEach, describe, expect, it, vi } from 'vitest';
import { LogLevel, logger } from './logger';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('logger', () => {
  it.each(Object.values(LogLevel))(
    '%s writes the message and context to the matching console method',
    (level) => {
      const spy = vi.spyOn(console, level).mockImplementation(() => {});
      const context = { from: 'a', to: 'b' };

      logger[level]('viewer status', context);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('viewer status', context);
    },
  );

  it('writes the message alone when there is no context', () => {
    const spy = vi.spyOn(console, LogLevel.Warn).mockImplementation(() => {});

    logger[LogLevel.Warn]('study is slow to load');

    expect(spy).toHaveBeenCalledWith('study is slow to load');
  });

  it('drops debug output in production builds', () => {
    vi.stubEnv('PROD', true);
    const spy = vi.spyOn(console, LogLevel.Debug).mockImplementation(() => {});

    logger[LogLevel.Debug]('ignored message', { reason: 'origin' });

    expect(spy).not.toHaveBeenCalled();
  });

  it('keeps the other levels in production builds', () => {
    vi.stubEnv('PROD', true);
    const spy = vi.spyOn(console, LogLevel.Info).mockImplementation(() => {});

    logger[LogLevel.Info]('viewer status', { from: 'a', to: 'b' });

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
