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
  ViewerActionType,
  ViewerState,
  type ViewerStatus,
  useViewerStatus,
  viewerStatusReducer,
} from './viewerStatus';

vi.mock('./logger');

const loading: ViewerStatus = { state: ViewerState.Loading };
const loaded: ViewerStatus = { state: ViewerState.Loaded };
const notFound: ViewerStatus = {
  state: ViewerState.Failed,
  reason: StudyLoadFailureReason.NotFound,
};

describe('viewerStatusReducer', () => {
  it('starts loading', () => {
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

  it('ignores studyLoaded and a later studyLoadFailed once failed: failed is terminal', () => {
    expect(viewerStatusReducer(notFound, { type: ViewerActionType.StudyLoaded })).toBe(notFound);
    expect(
      viewerStatusReducer(notFound, {
        type: ViewerActionType.StudyLoadFailed,
        reason: StudyLoadFailureReason.SourceUnreachable,
      }),
    ).toBe(notFound);
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

  beforeEach(() => {
    frame = document.body.appendChild(document.createElement('iframe'));
  });

  afterEach(() => {
    frame.remove();
  });

  it('starts loading and moves to loaded on the bridge message', () => {
    const { result } = renderStatus();
    expect(result.current.status).toStrictEqual(loading);

    postFromViewer(studyLoaded);

    expect(result.current.status).toStrictEqual(loaded);
  });

  it('stays loading indefinitely with no bridge message at all (research R7)', () => {
    vi.useFakeTimers();
    const { result } = renderStatus();

    act(() => {
      vi.advanceTimersByTime(10 * 60_000);
    });

    expect(result.current.status).toStrictEqual(loading);
    vi.useRealTimers();
  });
});
