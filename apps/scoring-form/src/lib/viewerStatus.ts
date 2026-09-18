import { BridgeEvent, type StudyLoadFailureReason } from '@bridge-contract';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { subscribeToViewer } from './bridge';
import { logger } from './logger';

export enum ViewerState {
  Loading = 'loading',
  Loaded = 'loaded',
  Failed = 'failed',
}

export enum ViewerActionType {
  StudyLoaded = 'studyLoaded',
  StudyLoadFailed = 'studyLoadFailed',
  Retry = 'retry',
  SlowTimerFired = 'slowTimerFired',
}

export type ViewerStatus =
  | { state: ViewerState.Loading; slow: boolean }
  | { state: ViewerState.Loaded }
  | { state: ViewerState.Failed; reason: StudyLoadFailureReason };

export type ViewerAction =
  | { type: ViewerActionType.StudyLoaded }
  | { type: ViewerActionType.StudyLoadFailed; reason: StudyLoadFailureReason }
  | { type: ViewerActionType.Retry }
  | { type: ViewerActionType.SlowTimerFired };

export const INITIAL_VIEWER_STATUS: ViewerStatus = { state: ViewerState.Loading, slow: false };

/** Slowness is only ever a warning, never a failure (research R7). */
export const SLOW_WARNING_MS = 10_000;

export function viewerStatusReducer(status: ViewerStatus, action: ViewerAction): ViewerStatus {
  switch (action.type) {
    // Viewer messages count only while loading. Later ones are expected (e.g. a late failure
    // after the study loaded) and ignored.
    case ViewerActionType.StudyLoaded:
      return status.state === ViewerState.Loading ? { state: ViewerState.Loaded } : status;
    case ViewerActionType.StudyLoadFailed:
      return status.state === ViewerState.Loading
        ? { state: ViewerState.Failed, reason: action.reason }
        : status;
    case ViewerActionType.SlowTimerFired:
      return status.state === ViewerState.Loading && !status.slow
        ? { state: ViewerState.Loading, slow: true }
        : status;
    case ViewerActionType.Retry:
      return status.state === ViewerState.Failed ? INITIAL_VIEWER_STATUS : status;
  }
}

type UseViewerStatusOptions = {
  origin: string;
  studyInstanceUid: string;
  /** Must be stable: a new function re-subscribes to the viewer. */
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
            message.event === BridgeEvent.StudyLoaded
              ? { type: ViewerActionType.StudyLoaded }
              : { type: ViewerActionType.StudyLoadFailed, reason: message.payload.reason },
          ),
      }),
    [origin, studyInstanceUid, getSource],
  );

  // Keyed on isLoading alone, so a retry (failed → loading) re-arms the timer and setting the
  // slow flag doesn't.
  const isLoading = status.state === ViewerState.Loading;
  useEffect(() => {
    if (!isLoading) {
      return;
    }
    const timer = setTimeout(
      () => dispatch({ type: ViewerActionType.SlowTimerFired }),
      SLOW_WARNING_MS,
    );
    return () => clearTimeout(timer);
  }, [isLoading]);

  // Logged here rather than in the reducer, which must stay pure.
  const previous = useRef(status);
  useEffect(() => {
    const from = previous.current;
    previous.current = status;
    if (from.state !== status.state) {
      logger.info('viewer status', {
        from: from.state,
        to: status.state,
        ...(status.state === ViewerState.Failed && { reason: status.reason }),
      });
    } else if (
      from.state === ViewerState.Loading &&
      status.state === ViewerState.Loading &&
      !from.slow &&
      status.slow
    ) {
      logger.warn('study is slow to load');
    }
  }, [status]);

  const retry = useCallback(() => {
    dispatch({ type: ViewerActionType.Retry });
    setAttempt((n) => n + 1);
  }, []);

  return { status, attempt, retry };
}
