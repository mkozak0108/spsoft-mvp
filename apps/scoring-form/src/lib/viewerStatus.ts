import { BridgeEvent, type StudyLoadFailureReason } from '@bridge-contract';
import { useEffect, useReducer, useRef } from 'react';
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
}

export type ViewerStatus =
  | { state: ViewerState.Loading }
  | { state: ViewerState.Loaded }
  | { state: ViewerState.Failed; reason: StudyLoadFailureReason };

export type ViewerAction =
  | { type: ViewerActionType.StudyLoaded }
  | { type: ViewerActionType.StudyLoadFailed; reason: StudyLoadFailureReason };

export const INITIAL_VIEWER_STATUS: ViewerStatus = { state: ViewerState.Loading };

// Viewer messages count only while loading. Later ones are expected (e.g. a late failure after
// the study loaded) and ignored. There is no timeout-based failure and no retry action: the
// viewer's own screen carries the loading and failure states (spec US2, revised; research R7).
export function viewerStatusReducer(status: ViewerStatus, action: ViewerAction): ViewerStatus {
  if (status.state !== ViewerState.Loading) {
    return status;
  }
  switch (action.type) {
    case ViewerActionType.StudyLoaded:
      return { state: ViewerState.Loaded };
    case ViewerActionType.StudyLoadFailed:
      return { state: ViewerState.Failed, reason: action.reason };
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

  // Logged here rather than in the reducer, which must stay pure. reason is logged for
  // diagnosis even though the UI no longer shows it (Principle IV).
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
    }
  }, [status]);

  return { status };
}
