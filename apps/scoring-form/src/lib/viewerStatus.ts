// Whether the study is on screen yet: the single source of truth for both
// panels (data-model.md § ViewerStatus).
import type { StudyLoadFailureReason } from '@bridge-contract';
import { useEffect, useReducer, useRef } from 'react';
import { subscribeToViewer } from './bridge';
import { logger } from './logger';

export type ViewerStatus = { status: 'loading'; slow: boolean } | { status: 'loaded' };

export type ViewerStatusAction =
  | { type: 'studyLoaded' }
  | { type: 'studyLoadFailed'; reason: StudyLoadFailureReason };

export const INITIAL_VIEWER_STATUS: ViewerStatus = { status: 'loading', slow: false };

export function viewerStatusReducer(state: ViewerStatus, action: ViewerStatusAction): ViewerStatus {
  if (state.status === 'loading' && action.type === 'studyLoaded') {
    return { status: 'loaded' };
  }
  return state;
}

type UseViewerStatusOptions = {
  origin: string;
  studyInstanceUid: string;
  /** The current viewer iframe's window. Must be a stable function. */
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
            message.event === 'studyLoaded'
              ? { type: 'studyLoaded' }
              : { type: 'studyLoadFailed', reason: message.payload.reason },
          ),
      }),
    [origin, studyInstanceUid, getSource],
  );

  // Logged here rather than in the reducer, which must stay pure.
  const previous = useRef(status);
  useEffect(() => {
    const from = previous.current;
    previous.current = status;
    if (from.status !== status.status) {
      logger.info('viewer status', { from: from.status, to: status.status });
    }
  }, [status]);

  return { status };
}
