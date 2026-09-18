import {
  BridgeEvent,
  type BridgeEventMessage,
  BridgeMessageType,
  BridgeSource,
  StudyLoadFailureReason,
} from '@bridge-contract';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INITIAL_VIEWER_STATUS,
  SLOW_WARNING_MS,
  ViewerActionType,
  ViewerState,
  type ViewerStatus,
  useViewerStatus,
  viewerStatusReducer,
} from './viewerStatus';

vi.mock('./logger');

const loading: ViewerStatus = { state: ViewerState.Loading, slow: false };
const slow: ViewerStatus = { state: ViewerState.Loading, slow: true };
const loaded: ViewerStatus = { state: ViewerState.Loaded };
const notFound: ViewerStatus = {
  state: ViewerState.Failed,
  reason: StudyLoadFailureReason.NotFound,
};

describe('viewerStatusReducer', () => {
  it('starts loading, without the slow warning', () => {
    expect(INITIAL_VIEWER_STATUS).toStrictEqual(loading);
  });

  it('moves from loading to loaded on studyLoaded', () => {
    expect(
      viewerStatusReducer(INITIAL_VIEWER_STATUS, { type: ViewerActionType.StudyLoaded }),
    ).toStrictEqual(loaded);
  });

  it('stays loaded on a repeated studyLoaded or a late studyLoadFailed', () => {
    expect(viewerStatusReducer(loaded, { type: ViewerActionType.StudyLoaded })).toBe(loaded);
    expect(
      viewerStatusReducer(loaded, {
        type: ViewerActionType.StudyLoadFailed,
        reason: StudyLoadFailureReason.NotFound,
      }),
    ).toBe(loaded);
  });

  it.each(Object.values(StudyLoadFailureReason))(
    'moves from loading to failed on studyLoadFailed (%s)',
    (reason) => {
      expect(
        viewerStatusReducer(INITIAL_VIEWER_STATUS, {
          type: ViewerActionType.StudyLoadFailed,
          reason,
        }),
      ).toStrictEqual({ state: ViewerState.Failed, reason });
    },
  );

  it('clears the slow flag when leaving loading', () => {
    expect(viewerStatusReducer(slow, { type: ViewerActionType.StudyLoaded })).toStrictEqual(loaded);
  });

  it('goes back to loading, without the slow warning, on retry from failed', () => {
    expect(viewerStatusReducer(notFound, { type: ViewerActionType.Retry })).toStrictEqual(loading);
  });

  it('ignores retry outside failed', () => {
    expect(viewerStatusReducer(INITIAL_VIEWER_STATUS, { type: ViewerActionType.Retry })).toBe(
      INITIAL_VIEWER_STATUS,
    );
    expect(viewerStatusReducer(loaded, { type: ViewerActionType.Retry })).toBe(loaded);
  });

  it('sets the slow flag, and only that, when the timer fires while loading', () => {
    expect(
      viewerStatusReducer(INITIAL_VIEWER_STATUS, { type: ViewerActionType.SlowTimerFired }),
    ).toStrictEqual(slow);
  });

  it('ignores the slow timer once loaded or failed', () => {
    expect(viewerStatusReducer(loaded, { type: ViewerActionType.SlowTimerFired })).toBe(loaded);
    expect(viewerStatusReducer(notFound, { type: ViewerActionType.SlowTimerFired })).toBe(
      notFound,
    );
  });

  it('ignores studyLoaded once failed', () => {
    expect(viewerStatusReducer(notFound, { type: ViewerActionType.StudyLoaded })).toBe(notFound);
  });
});

describe('useViewerStatus', () => {
  const ORIGIN = 'http://viewer.test:3000';
  const STUDY_UID = '1.2.3.4';
  let frame: HTMLIFrameElement;
  const getSource = () => frame.contentWindow;

  const studyLoaded: BridgeEventMessage = {
    source: BridgeSource.Viewer,
    type: BridgeMessageType.Event,
    event: BridgeEvent.StudyLoaded,
    payload: { StudyInstanceUID: STUDY_UID },
  };

  const studyNotFound: BridgeEventMessage = {
    source: BridgeSource.Viewer,
    type: BridgeMessageType.Event,
    event: BridgeEvent.StudyLoadFailed,
    payload: { StudyInstanceUID: STUDY_UID, reason: StudyLoadFailureReason.NotFound },
  };

  function renderStatus() {
    return renderHook(() =>
      useViewerStatus({ origin: ORIGIN, studyInstanceUid: STUDY_UID, getSource }),
    );
  }

  function postFromViewer(data: BridgeEventMessage) {
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { origin: ORIGIN, source: frame.contentWindow, data }),
      );
    });
  }

  function advance(ms: number) {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    frame = document.body.appendChild(document.createElement('iframe'));
  });

  afterEach(() => {
    frame.remove();
    vi.useRealTimers();
  });

  it('warns after SLOW_WARNING_MS, and only then, while still loading', () => {
    expect(SLOW_WARNING_MS).toBe(10_000);
    const { result } = renderStatus();

    advance(SLOW_WARNING_MS - 100);
    expect(result.current.status).toStrictEqual(loading);

    advance(100);
    expect(result.current.status).toStrictEqual(slow);
  });

  it('shows the study once it loads after the warning', () => {
    const { result } = renderStatus();
    advance(SLOW_WARNING_MS);

    postFromViewer(studyLoaded);

    expect(result.current.status).toStrictEqual(loaded);
  });

  it('never warns once loaded', () => {
    const { result } = renderStatus();
    postFromViewer(studyLoaded);

    advance(60_000);

    expect(result.current.status).toStrictEqual(loaded);
  });

  it('keeps loading with the warning, and never fails, when nothing arrives', () => {
    const { result } = renderStatus();

    advance(10 * 60_000);

    expect(result.current.status).toStrictEqual(slow);
  });

  it('retries from failed with a fresh slow timer and a new attempt', () => {
    const { result } = renderStatus();
    const firstAttempt = result.current.attempt;
    // Fail midway, so a leftover first timer would fire before a fresh one.
    advance(5_000);
    postFromViewer(studyNotFound);
    expect(result.current.status).toStrictEqual(notFound);

    act(() => {
      result.current.retry();
    });
    expect(result.current.status).toStrictEqual(loading);
    expect(result.current.attempt).toBe(firstAttempt + 1);

    advance(SLOW_WARNING_MS - 100);
    expect(result.current.status).toStrictEqual(loading);
    advance(100);
    expect(result.current.status).toStrictEqual(slow);
  });
});
