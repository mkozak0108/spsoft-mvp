// Host side of the postMessage bridge to the viewer iframe (apps/viewer).
// Message contract: @bridge-contract (apps/viewer/extensions/bridge/src/messages.ts).
// Viewer side: apps/viewer/extensions/bridge/.
import type { BridgeEventMessage, StudyLoadFailureReason } from '@bridge-contract';
import { logger } from './logger';

// The contract is types only, so the known reasons are listed here too; the
// `satisfies` check fails to compile if one isn't a contract reason.
const FAILURE_REASONS = ['notFound', 'sourceUnreachable'] as const satisfies readonly StudyLoadFailureReason[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Runtime check for untrusted message data; TypeScript types are not validation. */
export function isBridgeEventMessage(data: unknown): data is BridgeEventMessage {
  if (!isRecord(data) || data.source !== 'spsoft-mvp-viewer' || data.type !== 'event') {
    return false;
  }
  const { payload } = data;
  if (!isRecord(payload) || typeof payload.StudyInstanceUID !== 'string' || !payload.StudyInstanceUID) {
    return false;
  }
  switch (data.event) {
    case 'studyLoaded':
      return true;
    case 'studyLoadFailed':
      return (FAILURE_REASONS as readonly unknown[]).includes(payload.reason);
    default:
      return false;
  }
}

type SubscribeOptions = {
  /** The viewer's origin: the only origin messages are accepted from. */
  origin: string;
  /** Messages about any other study are dropped. */
  expectedStudyInstanceUid: string;
  /** The current viewer iframe's window, read when each message arrives. */
  getSource: () => Window | null;
  onMessage: (message: BridgeEventMessage) => void;
};

/** Listens for bridge events from the viewer iframe. Returns an unsubscribe function. */
export function subscribeToViewer({
  origin,
  expectedStudyInstanceUid,
  getSource,
  onMessage,
}: SubscribeOptions): () => void {
  const listener = (event: MessageEvent) => {
    // Never log the data itself: it is untrusted and may carry identifiers.
    if (event.origin !== origin) {
      logger.debug('ignored message', { reason: 'origin' });
      return;
    }
    const source = getSource();
    if (source === null || event.source !== source) {
      logger.debug('ignored message', { reason: 'source' });
      return;
    }
    if (!isBridgeEventMessage(event.data)) {
      logger.debug('ignored message', { reason: 'shape' });
      return;
    }
    if (event.data.payload.StudyInstanceUID !== expectedStudyInstanceUid) {
      logger.warn('ignored bridge message about another study', { event: event.data.event });
      return;
    }
    onMessage(event.data);
  };

  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}
