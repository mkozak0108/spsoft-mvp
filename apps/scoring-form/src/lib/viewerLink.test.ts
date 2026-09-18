import { describe, expect, it } from 'vitest';
import { buildViewerLink, parseViewerOrigin } from './viewerLink';

describe('parseViewerOrigin', () => {
  it.each([undefined, ''])('defaults to the local viewer for %j', (raw) => {
    expect(parseViewerOrigin(raw)).toBe('http://localhost:3000');
  });

  it.each([
    ['http://localhost:3000', 'http://localhost:3000'],
    ['http://host:3000/foo', 'http://host:3000'],
    ['https://viewer.example.org/', 'https://viewer.example.org'],
  ])('returns the origin of %s', (raw, origin) => {
    expect(parseViewerOrigin(raw)).toBe(origin);
  });

  it.each(['not a url', 'javascript:alert(1)', 'ftp://x'])(
    'rejects %s with an error naming VITE_VIEWER_URL',
    (raw) => {
      expect(() => parseViewerOrigin(raw)).toThrow(Error);
      expect(() => parseViewerOrigin(raw)).toThrow(/VITE_VIEWER_URL/);
    },
  );
});

describe('buildViewerLink', () => {
  it('opens the viewer route on the given study', () => {
    const uid = '1.3.6.1.4.1.25403.345050719074.3824.20170125095438.5';

    expect(buildViewerLink('http://localhost:3000', uid)).toBe(
      `http://localhost:3000/viewer?StudyInstanceUIDs=${uid}`,
    );
  });
});
