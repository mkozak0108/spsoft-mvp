// Whether the study is on screen yet: the single source of truth for both
// panels (data-model.md § ViewerStatus).
import type { StudyLoadFailureReason } from '@bridge-contract';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { subscribeToViewer } from './bridge';
import { logger } from './logger';

export type ViewerStatus =
  | { status: 'loading'; slow: boolean }
  | { status: 'loaded' }
  | { status: 'failed'; reason: StudyLoadFailureReason };

export type ViewerStatusAction =
  | { type: 'studyLoaded' }
  | { type: 'studyLoadFailed'; reason: StudyLoadFailureReason }
  | { type: 'retry' }
  | { type: 'slowTimerFired' };

export const INITIAL_VIEWER_STATUS: ViewerStatus = { status: 'loading', slow: false };

/**
 * How long loading may take before the doctor is told it's slow. Slowness is
 * only ever a warning, never a failure (research R7).
 */
export const SLOW_WARNING_MS = 10_000;

export function viewerStatusReducer(state: ViewerStatus, action: ViewerStatusAction): ViewerStatus {
  switch (action.type) {
    // Viewer messages count only while loading; later ones are expected
    // (e.g. a late failure after the study loaded) and ignored.
    case 'studyLoaded':
      return state.status === 'loading' ? { status: 'loaded' } : state;
    case 'studyLoadFailed':
      return state.status === 'loading' ? { status: 'failed', reason: action.reason } : state;
    case 'slowTimerFired':
      return state.status === 'loading' && !state.slow ? { status: 'loading', slow: true } : state;
    case 'retry':
      return state.status === 'failed' ? INITIAL_VIEWER_STATUS : state;
  }
}

type UseViewerStatusOptions = {
  origin: string;
  studyInstanceUid: string;
  /** The current viewer iframe's window. Must be a stable function. */
  getSource: () => Window | null;
};

export function useViewerStatus({ origin, studyInstanceUid, getSource }: UseViewerStatusOptions) {
  const [status, dispatch] = useReducer(viewerStatusReducer, INITIAL_VIEWER_STATUS);
  // Bumped by retry, so the caller can remount the viewer iframe.
  const [attempt, setAttempt] = useState(0);

  useEffect(
    () =>
      subscribeToViewer({
        origin,
        expectedStudyInstanceUid: studyInstanceUid,
        getSource,
        onMessage: (message) =>
          dispatch(
            message.event === 'studyLoaded'
              ? { type: 'studyLoaded' }
              : { type: 'studyLoadFailed', reason: message.payload.reason },
          ),
      }),
    [origin, studyInstanceUid, getSource],
  );

  // A fresh slow-warning timer each time loading starts: on mount and on retry.
  const isLoading = status.status === 'loading';
  useEffect(() => {
    if (!isLoading) {
      return;
    }
    const timer = setTimeout(() => dispatch({ type: 'slowTimerFired' }), SLOW_WARNING_MS);
    return () => clearTimeout(timer);
  }, [isLoading]);

  // Logged here rather than in the reducer, which must stay pure.
  const previous = useRef(status);
  useEffect(() => {
    const from = previous.current;
    previous.current = status;
    if (from.status !== status.status) {
      logger.info('viewer status', {
        from: from.status,
        to: status.status,
        ...(status.status === 'failed' && { reason: status.reason }),
      });
    } else if (from.status === 'loading' && status.status === 'loading' && !from.slow && status.slow) {
      logger.warn('study is slow to load');
    }
  }, [status]);

  const retry = useCallback(() => {
    dispatch({ type: 'retry' });
    setAttempt((n) => n + 1);
  }, []);

  return { status, attempt, retry };
}
