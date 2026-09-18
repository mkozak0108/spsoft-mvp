// Where the viewer lives, and the link that opens it on one study
// (research R9). The viewer's origin is also the only origin bridge messages
// are accepted from.
const DEFAULT_VIEWER_URL = 'http://localhost:3000';

/** Returns the origin of `VITE_VIEWER_URL`, or throws if it isn't http(s). */
export function parseViewerOrigin(raw: string | undefined): string {
  const value = raw || DEFAULT_VIEWER_URL;
  const url = URL.canParse(value) ? new URL(value) : null;
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    throw new Error('VITE_VIEWER_URL must be an http or https URL');
  }
  return url.origin;
}

export function buildViewerLink(origin: string, studyInstanceUid: string): string {
  const url = new URL('/viewer', origin);
  url.search = new URLSearchParams({ StudyInstanceUIDs: studyInstanceUid }).toString();
  return url.toString();
}
