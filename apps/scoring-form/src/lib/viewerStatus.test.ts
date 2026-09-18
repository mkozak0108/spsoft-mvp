import { describe, expect, it } from 'vitest';
import { INITIAL_VIEWER_STATUS, type ViewerStatus, viewerStatusReducer } from './viewerStatus';

describe('viewerStatusReducer', () => {
  it('starts loading, without the slow warning', () => {
    expect(INITIAL_VIEWER_STATUS).toStrictEqual({ status: 'loading', slow: false });
  });

  it('moves from loading to loaded on studyLoaded', () => {
    expect(viewerStatusReducer(INITIAL_VIEWER_STATUS, { type: 'studyLoaded' })).toStrictEqual({
      status: 'loaded',
    });
  });

  it('stays loaded on a repeated studyLoaded or a late studyLoadFailed', () => {
    const loaded: ViewerStatus = { status: 'loaded' };

    expect(viewerStatusReducer(loaded, { type: 'studyLoaded' })).toBe(loaded);
    expect(viewerStatusReducer(loaded, { type: 'studyLoadFailed', reason: 'notFound' })).toBe(
      loaded,
    );
  });
});
