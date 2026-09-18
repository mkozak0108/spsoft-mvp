import {
  BridgeEvent,
  type BridgeEventMessage,
  BridgeMessageType,
  BridgeSource,
  STUDY_UIDS_PARAM,
  StudyLoadFailureReason,
} from '@bridge-contract';
import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./lib/logger');

const VIEWER_ORIGIN = 'http://viewer.test:3000';
const STUDY_UID = '1.3.6.1.4.1.25403.345050719074.3824.20170125095438.5';
const STUDY_LINK = `?${STUDY_UIDS_PARAM}=${STUDY_UID}`;
const FORM_CONTROLS = ['textbox', 'combobox', 'checkbox', 'radio', 'spinbutton'] as const;

const studyLoaded: BridgeEventMessage = {
  source: BridgeSource.Viewer,
  type: BridgeMessageType.Event,
  event: BridgeEvent.StudyLoaded,
  payload: { StudyInstanceUID: STUDY_UID },
};

function studyLoadFailed(reason: StudyLoadFailureReason): BridgeEventMessage {
  return {
    source: BridgeSource.Viewer,
    type: BridgeMessageType.Event,
    event: BridgeEvent.StudyLoadFailed,
    payload: { StudyInstanceUID: STUDY_UID, reason },
  };
}

function openPage(search: string) {
  window.history.replaceState(null, '', `/${search}`);
  return render(<App />);
}

function viewerFrame(): HTMLIFrameElement {
  return screen.getByTitle('Study viewer') as HTMLIFrameElement;
}

function scoringForm(): HTMLElement {
  return screen.getByRole('region', { name: 'Scoring form' });
}

function postFromViewer(data: BridgeEventMessage) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: VIEWER_ORIGIN,
        source: viewerFrame().contentWindow,
        data,
      }),
    );
  });
}

function expectUnavailableForm() {
  expect(within(scoringForm()).getByText('Scoring is unavailable.')).toBeTruthy();
}

beforeEach(() => {
  vi.stubEnv('VITE_VIEWER_URL', VIEWER_ORIGIN);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('US1: open a study next to the scoring form', () => {
  it('embeds the viewer on the linked study, next to the scoring form (US1-1)', () => {
    openPage(STUDY_LINK);

    expect(viewerFrame().src).toBe(`${VIEWER_ORIGIN}/viewer${STUDY_LINK}`);
    expect(scoringForm()).toBeTruthy();
  });

  it('shows the study and the form with no status or error once loaded (US1-1)', () => {
    openPage(STUDY_LINK);

    postFromViewer(studyLoaded);

    expect(viewerFrame()).toBeTruthy();
    expect(scoringForm()).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a placeholder and no inputs in the form once loaded (US1-3)', () => {
    openPage(STUDY_LINK);

    postFromViewer(studyLoaded);

    const form = scoringForm();
    expect(within(form).getByText('Scoring is not available yet.')).toBeTruthy();
    for (const role of FORM_CONTROLS) {
      expect(within(form).queryByRole(role)).toBeNull();
    }
  });

  it('keeps the form unchanged after later viewer messages (US1-2)', () => {
    openPage(STUDY_LINK);
    postFromViewer(studyLoaded);
    const before = scoringForm().textContent;

    postFromViewer(studyLoaded);
    postFromViewer(studyLoadFailed(StudyLoadFailureReason.NotFound));

    expect(scoringForm().textContent).toBe(before);
  });

  it('opens the same study again after a reload (US1-4)', () => {
    const first = openPage(STUDY_LINK);
    const src = viewerFrame().src;
    first.unmount();

    render(<App />);

    expect(viewerFrame().src).toBe(src);
  });
});

describe('US2: the form panel reflects whether a study is on screen', () => {
  it('shows a waiting form while loading, with no host-added status over the viewer (US2-1)', () => {
    openPage(STUDY_LINK);

    expect(within(scoringForm()).getByRole('status').textContent).toBe(
      'Waiting for the study to load…',
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(Object.values(StudyLoadFailureReason))(
    'shows the form as unavailable on studyLoadFailed, with the same wording for every reason (US2-1)',
    (reason) => {
      openPage(STUDY_LINK);

      postFromViewer(studyLoadFailed(reason));

      expectUnavailableForm();
      // No host-added alert or Try again: the viewer's own screen carries the failure.
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByRole('button')).toBeNull();
      expect(viewerFrame().hidden).toBe(false);
    },
  );

  it.each([
    [
      'no study identifier',
      '',
      'No study selected',
      'Open this page using a link that includes a study.',
    ],
    [
      'a malformed study identifier',
      `?${STUDY_UIDS_PARAM}=abc`,
      'This study link is not valid',
      'Check the link you were given and try again.',
    ],
  ])('says so plainly for %s, without opening the viewer (US2-2)', (_case, search, title, text) => {
    openPage(search);

    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(title)).toBeTruthy();
    expect(within(alert).getByText(text)).toBeTruthy();
    expect(screen.queryByTitle('Study viewer')).toBeNull();
    expectUnavailableForm();
  });

  it('never echoes a malformed study identifier (US2-2)', () => {
    openPage(`?${STUDY_UIDS_PARAM}=abc`);

    expect(document.body.textContent).not.toContain('abc');
  });

  it('says the viewer is not configured when VITE_VIEWER_URL is invalid', () => {
    vi.stubEnv('VITE_VIEWER_URL', 'ftp://x');
    openPage(STUDY_LINK);

    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('The viewer is not configured')).toBeTruthy();
    expect(
      within(alert).getByText(
        "Set VITE_VIEWER_URL to the viewer's http or https address, then restart the app.",
      ),
    ).toBeTruthy();
    expect(screen.queryByTitle('Study viewer')).toBeNull();
    expectUnavailableForm();
  });
});
