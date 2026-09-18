import {
  BridgeEvent,
  type BridgeEventMessage,
  BridgeMessageType,
  BridgeSource,
  StudyLoadFailureReason,
} from '@bridge-contract';
import { logger } from './logger';

enum IgnoredBecause {
  Origin = 'origin',
  Source = 'source',
  Shape = 'shape',
}

const FAILURE_REASONS: readonly unknown[] = Object.values(StudyLoadFailureReason);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Message data is untrusted input, and TypeScript types are not validation. */
export function isBridgeEventMessage(data: unknown): data is BridgeEventMessage {
  if (!isRecord(data) || data.source !== BridgeSource.Viewer || data.type !== BridgeMessageType.Event) {
    return false;
  }
  const { payload } = data;
  if (!isRecord(payload) || typeof payload.StudyInstanceUID !== 'string' || !payload.StudyInstanceUID) {
    return false;
  }
  switch (data.event) {
    case BridgeEvent.StudyLoaded:
      return true;
    case BridgeEvent.StudyLoadFailed:
      return FAILURE_REASONS.includes(payload.reason);
    default:
      return false;
  }
}

type SubscribeOptions = {
  origin: string;
  expectedStudyInstanceUid: string;
  /** Read per message, so after Try again only the remounted iframe is an accepted source. */
  getSource: () => Window | null;
  onMessage: (message: BridgeEventMessage) => void;
};

export function subscribeToViewer({
  origin,
  expectedStudyInstanceUid,
  getSource,
  onMessage,
}: SubscribeOptions): () => void {
  const listener = (event: MessageEvent) => {
    // Never log the data itself: it is untrusted and may carry identifiers.
    if (event.origin !== origin) {
      logger.debug('ignored message', { reason: IgnoredBecause.Origin });
      return;
    }
    const source = getSource();
    if (source === null || event.source !== source) {
      logger.debug('ignored message', { reason: IgnoredBecause.Source });
      return;
    }
    if (!isBridgeEventMessage(event.data)) {
      logger.debug('ignored message', { reason: IgnoredBecause.Shape });
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
