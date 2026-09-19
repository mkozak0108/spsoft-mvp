import {
  BridgeEvent,
  type BridgeCommandMessage,
  type BridgeEventMessage,
  BridgeMessageType,
  BridgeSource,
  BridgeVersion,
  StudyLoadFailureReason,
} from '@bridge-contract';
import { isNonEmptyString, isRecord } from '../utils/guards';
import { logger } from './logger';

enum IgnoredBecause {
  Origin = 'origin',
  Source = 'source',
  Version = 'version',
  Shape = 'shape',
}

const FAILURE_REASONS: readonly unknown[] = Object.values(StudyLoadFailureReason);
const MAX_UNIT_LENGTH = 16;

/** Message data is untrusted input, and TypeScript types are not validation. */
export function isBridgeEventMessage(data: unknown): data is BridgeEventMessage {
  if (
    !isRecord(data) ||
    data.source !== BridgeSource.Viewer ||
    data.type !== BridgeMessageType.Event ||
    data.version !== BridgeVersion.V1
  ) {
    return false;
  }
  const { payload } = data;
  if (!isRecord(payload) || !isNonEmptyString(payload.StudyInstanceUID)) {
    return false;
  }
  switch (data.event) {
    case BridgeEvent.StudyLoaded:
    case BridgeEvent.ViewerReady:
      return true;
    case BridgeEvent.StudyLoadFailed:
      return FAILURE_REASONS.includes(payload.reason);
    case BridgeEvent.MeasurementAdded:
      return (
        isNonEmptyString(payload.rowId) &&
        typeof payload.area === 'number' &&
        Number.isFinite(payload.area) &&
        payload.area >= 0 &&
        isNonEmptyString(payload.unit) &&
        payload.unit.length <= MAX_UNIT_LENGTH
      );
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
    // Wrong origin or window is other pages' traffic, which production silences (debug). Once
    // both match the sender is the viewer, so any later rejection is a fault worth seeing (warn).
    if (event.origin !== origin) {
      logger.debug('ignored message', { reason: IgnoredBecause.Origin });
      return;
    }
    const source = getSource();
    if (source === null || event.source !== source) {
      logger.debug('ignored message', { reason: IgnoredBecause.Source });
      return;
    }
    if (isRecord(event.data) && event.data.version !== BridgeVersion.V1) {
      logger.warn('ignored message', { reason: IgnoredBecause.Version });
      return;
    }
    if (!isBridgeEventMessage(event.data)) {
      logger.warn('ignored message', { reason: IgnoredBecause.Shape });
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

type PostOptions = {
  origin: string;
  getSource: () => Window | null;
  message: BridgeCommandMessage;
};

export function postToViewer({ origin, getSource, message }: PostOptions): void {
  const target = getSource();
  if (target === null) {
    logger.warn('command not sent: the viewer is not mounted', { command: message.command });
    return;
  }
  // The exact origin, never '*': a page that navigated the frame away must not get the command.
  target.postMessage(message, origin);
}
