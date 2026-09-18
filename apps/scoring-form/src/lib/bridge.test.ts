import type { BridgeEventMessage } from '@bridge-contract';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isBridgeEventMessage, subscribeToViewer } from './bridge';
import { logger } from './logger';

vi.mock('./logger');

const VIEWER_ORIGIN = 'http://viewer.test:3000';
const STUDY_UID = '1.2.3.4';

const studyLoaded: BridgeEventMessage = {
  source: 'spsoft-mvp-viewer',
  type: 'event',
  event: 'studyLoaded',
  payload: { StudyInstanceUID: STUDY_UID },
};

function studyLoadFailed(reason: string): unknown {
  return {
    source: 'spsoft-mvp-viewer',
    type: 'event',
    event: 'studyLoadFailed',
    payload: { StudyInstanceUID: STUDY_UID, reason },
  };
}

describe('isBridgeEventMessage', () => {
  it('accepts studyLoaded', () => {
    expect(isBridgeEventMessage(studyLoaded)).toBe(true);
  });

  it.each(['notFound', 'sourceUnreachable'])('accepts studyLoadFailed with reason %s', (reason) => {
    expect(isBridgeEventMessage(studyLoadFailed(reason))).toBe(true);
  });

  it('accepts messages with extra fields', () => {
    const message = {
      ...studyLoaded,
      extra: true,
      payload: { ...studyLoaded.payload, extra: 1 },
    };
    expect(isBridgeEventMessage(message)).toBe(true);
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['a string', 'studyLoaded'],
    ['an array', [studyLoaded]],
    ['a wrong source', { ...studyLoaded, source: 'someone-else' }],
    ['a wrong type', { ...studyLoaded, type: 'command' }],
    ['a wrong event', { ...studyLoaded, event: 'ready' }],
    ['a missing payload', { source: 'spsoft-mvp-viewer', type: 'event', event: 'studyLoaded' }],
    ['a non-object payload', { ...studyLoaded, payload: 'x' }],
    ['a null payload', { ...studyLoaded, payload: null }],
    ['an empty StudyInstanceUID', { ...studyLoaded, payload: { StudyInstanceUID: '' } }],
    ['a non-string StudyInstanceUID', { ...studyLoaded, payload: { StudyInstanceUID: 1234 } }],
    ['an unknown reason', studyLoadFailed('timeout')],
    [
      'studyLoadFailed without a reason',
      { ...studyLoaded, event: 'studyLoadFailed', payload: { StudyInstanceUID: STUDY_UID } },
    ],
  ])('rejects %s', (_case, data) => {
    expect(isBridgeEventMessage(data)).toBe(false);
  });
});

describe('subscribeToViewer', () => {
  let firstFrame: HTMLIFrameElement;
  let secondFrame: HTMLIFrameElement;
  let currentFrame: HTMLIFrameElement;
  let onMessage: Mock<(message: BridgeEventMessage) => void>;
  let unsubscribe: () => void;

  function post(data: unknown, { origin = VIEWER_ORIGIN, from = firstFrame } = {}) {
    window.dispatchEvent(
      new MessageEvent('message', { data, origin, source: from.contentWindow }),
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    firstFrame = document.body.appendChild(document.createElement('iframe'));
    secondFrame = document.body.appendChild(document.createElement('iframe'));
    currentFrame = firstFrame;
    onMessage = vi.fn();
    unsubscribe = subscribeToViewer({
      origin: VIEWER_ORIGIN,
      expectedStudyInstanceUid: STUDY_UID,
      getSource: () => currentFrame.contentWindow,
      onMessage,
    });
  });

  afterEach(() => {
    unsubscribe();
    firstFrame.remove();
    secondFrame.remove();
  });

  it('delivers a valid message from the viewer frame and origin', () => {
    post(studyLoaded);

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith(studyLoaded);
  });

  it('ignores a message from another origin', () => {
    post(studyLoaded, { origin: 'http://evil.test' });

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('ignores a message from another window', () => {
    post(studyLoaded, { from: secondFrame });

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('checks the source window at event time', () => {
    currentFrame = secondFrame;

    post(studyLoaded, { from: firstFrame });
    post(studyLoaded, { from: secondFrame });

    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it('ignores malformed data', () => {
    post({ ...studyLoaded, event: 'ready' });

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('ignores a message about another study, without logging identifiers', () => {
    post({ ...studyLoaded, payload: { StudyInstanceUID: '9.8.7.6' } });

    expect(onMessage).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(vi.mocked(logger.warn).mock.calls);
    expect(logged).not.toContain('9.8.7.6');
    expect(logged).not.toContain(STUDY_UID);
  });

  it('delivers nothing after unsubscribing', () => {
    unsubscribe();

    post(studyLoaded);

    expect(onMessage).not.toHaveBeenCalled();
  });
});
