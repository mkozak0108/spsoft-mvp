import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from './logger';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('logger', () => {
  it.each(['debug', 'info', 'warn', 'error'] as const)(
    '%s writes the message and context to the matching console method',
    (level) => {
      const spy = vi.spyOn(console, level).mockImplementation(() => {});
      const context = { from: 'loading', to: 'loaded' };

      logger[level]('viewer status', context);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('viewer status', context);
    },
  );

  it('writes the message alone when there is no context', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logger.warn('study is slow to load');

    expect(spy).toHaveBeenCalledWith('study is slow to load');
  });

  it('drops debug output in production builds', () => {
    vi.stubEnv('PROD', true);
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    logger.debug('ignored message', { reason: 'origin' });

    expect(spy).not.toHaveBeenCalled();
  });

  it('keeps the other levels in production builds', () => {
    vi.stubEnv('PROD', true);
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});

    logger.info('viewer status', { from: 'loading', to: 'loaded' });

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
