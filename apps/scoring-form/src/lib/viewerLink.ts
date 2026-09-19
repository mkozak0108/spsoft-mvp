import { STUDY_UIDS_PARAM } from '@bridge-contract';

const DEFAULT_VIEWER_URL = 'http://localhost:3000';
const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);
const VIEWER_ROUTE = '/viewer';

/**
 * Throws when `VITE_VIEWER_URL` isn't an http(s) URL. Only the origin is kept, because it is
 * also the only origin bridge messages are accepted from.
 */
export function parseViewerOrigin(raw: string | undefined): string {
  const value = raw || DEFAULT_VIEWER_URL;
  const url = URL.canParse(value) ? new URL(value) : null;
  if (!url || !ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new Error('VITE_VIEWER_URL must be an http or https URL');
  }
  return url.origin;
}

export function buildViewerLink(origin: string, studyInstanceUid: string): string {
  const url = new URL(VIEWER_ROUTE, origin);
  url.search = new URLSearchParams({ [STUDY_UIDS_PARAM]: studyInstanceUid }).toString();
  return url.toString();
}
