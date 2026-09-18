import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INITIAL_VIEWER_STATUS,
  SLOW_WARNING_MS,
  type ViewerStatus,
  useViewerStatus,
  viewerStatusReducer,
} from './viewerStatus';

vi.mock('./logger');

describe('viewerStatusReducer', () => {
  const loaded: ViewerStatus = { status: 'loaded' };

  it('starts loading, without the slow warning', () => {
    expect(INITIAL_VIEWER_STATUS).toStrictEqual({ status: 'loading', slow: false });
  });

  it('moves from loading to loaded on studyLoaded', () => {
    expect(viewerStatusReducer(INITIAL_VIEWER_STATUS, { type: 'studyLoaded' })).toStrictEqual({
      status: 'loaded',
    });
  });

  it('stays loaded on a repeated studyLoaded or a late studyLoadFailed', () => {
    expect(viewerStatusReducer(loaded, { type: 'studyLoaded' })).toBe(loaded);
    expect(viewerStatusReducer(loaded, { type: 'studyLoadFailed', reason: 'notFound' })).toBe(
      loaded,
    );
  });

  it.each(['notFound', 'sourceUnreachable'] as const)(
    'moves from loading to failed on studyLoadFailed (%s)',
    (reason) => {
      expect(
        viewerStatusReducer(INITIAL_VIEWER_STATUS, { type: 'studyLoadFailed', reason }),
      ).toStrictEqual({ status: 'failed', reason });
    },
  );

  it('clears the slow flag when leaving loading', () => {
    const slow: ViewerStatus = { status: 'loading', slow: true };

    expect(viewerStatusReducer(slow, { type: 'studyLoaded' })).toStrictEqual({ status: 'loaded' });
  });

  it('goes back to loading, without the slow warning, on retry from failed', () => {
    const failed: ViewerStatus = { status: 'failed', reason: 'notFound' };

    expect(viewerStatusReducer(failed, { type: 'retry' })).toStrictEqual({
      status: 'loading',
      slow: false,
    });
  });

  it('ignores retry outside failed', () => {
    expect(viewerStatusReducer(INITIAL_VIEWER_STATUS, { type: 'retry' })).toBe(
      INITIAL_VIEWER_STATUS,
    );
    expect(viewerStatusReducer(loaded, { type: 'retry' })).toBe(loaded);
  });

  it('sets the slow flag, and only that, when the timer fires while loading', () => {
    expect(viewerStatusReducer(INITIAL_VIEWER_STATUS, { type: 'slowTimerFired' })).toStrictEqual({
      status: 'loading',
      slow: true,
    });
  });

  it('ignores the slow timer once loaded or failed', () => {
    const failed: ViewerStatus = { status: 'failed', reason: 'sourceUnreachable' };

    expect(viewerStatusReducer(loaded, { type: 'slowTimerFired' })).toBe(loaded);
    expect(viewerStatusReducer(failed, { type: 'slowTimerFired' })).toBe(failed);
  });

  it('ignores studyLoaded once failed', () => {
    const failed: ViewerStatus = { status: 'failed', reason: 'notFound' };

    expect(viewerStatusReducer(failed, { type: 'studyLoaded' })).toBe(failed);
  });
});

describe('useViewerStatus', () => {
  const ORIGIN = 'http://viewer.test:3000';
  const STUDY_UID = '1.2.3.4';
  let frame: HTMLIFrameElement;
  const getSource = () => frame.contentWindow;

  function renderStatus() {
    return renderHook(() =>
      useViewerStatus({ origin: ORIGIN, studyInstanceUid: STUDY_UID, getSource }),
    );
  }

  function postFromViewer(data: unknown) {
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { origin: ORIGIN, source: frame.contentWindow, data }),
      );
    });
  }

  const studyLoaded = {
    source: 'spsoft-mvp-viewer',
    type: 'event',
    event: 'studyLoaded',
    payload: { StudyInstanceUID: STUDY_UID },
  };

  const studyNotFound = {
    source: 'spsoft-mvp-viewer',
    type: 'event',
    event: 'studyLoadFailed',
    payload: { StudyInstanceUID: STUDY_UID, reason: 'notFound' },
  };

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
    expect(result.current.status).toStrictEqual({ status: 'loading', slow: false });

    advance(100);
    expect(result.current.status).toStrictEqual({ status: 'loading', slow: true });
  });

  it('shows the study once it loads after the warning', () => {
    const { result } = renderStatus();
    advance(SLOW_WARNING_MS);

    postFromViewer(studyLoaded);

    expect(result.current.status).toStrictEqual({ status: 'loaded' });
  });

  it('never warns once loaded', () => {
    const { result } = renderStatus();
    postFromViewer(studyLoaded);

    advance(60_000);

    expect(result.current.status).toStrictEqual({ status: 'loaded' });
  });

  it('keeps loading with the warning, and never fails, when nothing arrives', () => {
    const { result } = renderStatus();

    advance(10 * 60_000);

    expect(result.current.status).toStrictEqual({ status: 'loading', slow: true });
  });

  it('retries from failed with a fresh slow timer and a new attempt', () => {
    const { result } = renderStatus();
    const firstAttempt = result.current.attempt;
    // Fail midway, so a leftover first timer would fire before a fresh one.
    advance(5_000);
    postFromViewer(studyNotFound);
    expect(result.current.status).toStrictEqual({ status: 'failed', reason: 'notFound' });

    act(() => {
      result.current.retry();
    });
    expect(result.current.status).toStrictEqual({ status: 'loading', slow: false });
    expect(result.current.attempt).toBe(firstAttempt + 1);

    advance(SLOW_WARNING_MS - 100);
    expect(result.current.status).toStrictEqual({ status: 'loading', slow: false });
    advance(100);
    expect(result.current.status).toStrictEqual({ status: 'loading', slow: true });
  });
});
