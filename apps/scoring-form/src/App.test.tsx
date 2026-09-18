import {
  BridgeEvent,
  type BridgeEventMessage,
  BridgeMessageType,
  BridgeSource,
  STUDY_UIDS_PARAM,
  StudyLoadFailureReason,
} from '@bridge-contract';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
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

function blockContaining(text: string, role: 'status' | 'alert'): HTMLElement {
  const block = screen.getByText(text).closest<HTMLElement>(`[role="${role}"]`);
  expect(block).not.toBeNull();
  return block as HTMLElement;
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

describe('US2: feedback while the study loads or fails to load', () => {
  it('shows a loading status and a waiting form until the study loads (US2-1)', () => {
    openPage(STUDY_LINK);

    const loading = blockContaining('Loading study…', 'status');
    expect(scoringForm().contains(loading)).toBe(false);
    expect(within(scoringForm()).getByRole('status').textContent).toBe(
      'Waiting for the study to load…',
    );
  });

  it.each([
    [
      StudyLoadFailureReason.NotFound,
      'Study not found',
      'The image source has no study with this identifier.',
    ],
    [
      StudyLoadFailureReason.SourceUnreachable,
      "Can't reach the image source",
      'Check your connection and try again.',
    ],
  ])('explains a %s failure and offers to try again (US2-2)', (reason, title, text) => {
    openPage(STUDY_LINK);

    postFromViewer(studyLoadFailed(reason));

    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(title)).toBeTruthy();
    expect(within(alert).getByText(text)).toBeTruthy();
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(viewerFrame().hidden).toBe(true);
    expectUnavailableForm();
  });

  it('reloads the viewer in a new frame on Try again (US2-2)', () => {
    openPage(STUDY_LINK);
    postFromViewer(studyLoadFailed(StudyLoadFailureReason.NotFound));
    const failedFrame = viewerFrame();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(viewerFrame()).not.toBe(failedFrame);
    expect(viewerFrame().hidden).toBe(false);
    expect(blockContaining('Loading study…', 'status')).toBeTruthy();
    expect(screen.queryByText('This is taking longer than it should.')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

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
  ])('says so plainly for %s, without opening the viewer (US2-3)', (_case, search, title, text) => {
    openPage(search);

    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(title)).toBeTruthy();
    expect(within(alert).getByText(text)).toBeTruthy();
    expect(screen.queryByTitle('Study viewer')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expectUnavailableForm();
  });

  it('never echoes a malformed study identifier (US2-3)', () => {
    openPage(`?${STUDY_UIDS_PARAM}=abc`);

    expect(document.body.textContent).not.toContain('abc');
  });

  it('warns, without offering an action, when loading takes over 10 seconds (US2-4)', () => {
    vi.useFakeTimers();
    openPage(STUDY_LINK);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    const loading = blockContaining('Loading study…', 'status');
    expect(within(loading).getByText('This is taking longer than it should.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();

    postFromViewer(studyLoaded);

    expect(screen.queryByText('Loading study…')).toBeNull();
    expect(screen.queryByText('This is taking longer than it should.')).toBeNull();
    expect(within(scoringForm()).getByText('Scoring is not available yet.')).toBeTruthy();
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
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expectUnavailableForm();
  });
});
